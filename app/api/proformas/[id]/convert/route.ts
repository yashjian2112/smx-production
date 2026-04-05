import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextSerial } from '@/lib/serial';
import { generateNextPowerstageBarcode, generateNextBrainboardBarcode, generateNextQCBarcode, generateNextHarnessBarcode, generateNextHarnessSerial } from '@/lib/barcode';
import { StageType } from '@prisma/client';
import { z } from 'zod';

const schema = z.object({
  orderNumber: z.string().optional(),   // auto-generated if not provided
  notes:       z.string().optional(),
});

async function generateNextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `WO-${year}-`;
  const existing = await prisma.order.findMany({
    where: { orderNumber: { startsWith: prefix } },
    select: { orderNumber: true },
  });
  let maxSeq = 0;
  for (const o of existing) {
    const numPart = o.orderNumber.slice(prefix.length);
    const n = parseInt(numPart, 10);
    if (!isNaN(n) && n > maxSeq) maxSeq = n;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS');

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const proforma = await prisma.proformaInvoice.findUnique({
      where: { id: params.id },
      include: { items: { orderBy: { sortOrder: 'asc' }, include: { product: true } } },
    });
    if (!proforma) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (proforma.status !== 'APPROVED')
      return NextResponse.json({ error: 'Only approved invoices can be converted to orders' }, { status: 400 });
    if (proforma.orderId)
      return NextResponse.json({ error: 'Already converted to order', orderId: proforma.orderId }, { status: 400 });

    // Find ALL product items (exclude freight/service lines without productId)
    const productItems = proforma.items.filter((i) => i.productId && i.product);
    if (productItems.length === 0)
      return NextResponse.json({ error: 'No product line item found in this invoice to create an order from' }, { status: 400 });

    // Detect harness items — "Harness for ..." lines added by proforma creation
    const harnessItems = proforma.items.filter((i) => !i.productId && /^Harness for /i.test(i.description ?? ''));
    const harnessRequired = harnessItems.length > 0;
    const harnessQty = harnessItems.reduce((sum, i) => sum + i.quantity, 0);

    // Total quantity across all products
    const totalQty = productItems.reduce((sum, item) => sum + item.quantity, 0);

    // Use first product as the primary product on the order
    const primaryProduct = productItems[0].product!;

    // Auto-generate or use provided order number
    const orderNumber = parsed.data.orderNumber?.trim() || await generateNextOrderNumber();

    // Check for duplicate order number
    const existingOrder = await prisma.order.findFirst({ where: { orderNumber } });
    if (existingOrder)
      return NextResponse.json({ error: `Order number "${orderNumber}" already exists` }, { status: 400 });

    // Check if this proforma is linked to a ReturnRequest (replacement order)
    const linkedReturn = await prisma.returnRequest.findFirst({
      where: { proformaId: proforma.id },
      select: { id: true },
    });

    // Create ONE order for all products, total quantity
    const order = await prisma.order.create({
      data: {
        orderNumber,
        productId:    primaryProduct.id,
        clientId:     proforma.clientId,
        quantity:     totalQty,
        priority:     0,
        status:       'ACTIVE',
        createdById:  session.id,
        harnessRequired,
        // Use the controller product for harness tracking (same product family)
        harnessProductId: harnessRequired ? primaryProduct.id : undefined,
      },
      include: { product: true },
    });

    const notesText = parsed.data.notes?.trim();
    const productSummary = productItems.map(i => `${i.product!.code} x${i.quantity}`).join(', ');
    await appendTimeline({
      orderId: order.id,
      userId:  session.id,
      action:  'order_created',
      remarks: `Converted from Proforma Invoice ${proforma.invoiceNumber} — ${productSummary}${notesText ? ` — Notes: ${notesText}` : ''}`,
    });

    // Generate units for EACH product item
    for (const targetItem of productItems) {
      const product = targetItem.product!;
      const qty = targetItem.quantity;
      const isTrading = product.productType === 'TRADING';

      if (isTrading) {
        // ── TRADING ITEMS: units start at FINAL_ASSEMBLY / PENDING (approved on DO creation) ──
        for (let i = 0; i < qty; i++) {
          const serial = await generateNextSerial(product.code);

          await prisma.controllerUnit.create({
            data: {
              serialNumber: serial,
              orderId:     order.id,
              productId:   product.id,
              currentStage:  StageType.FINAL_ASSEMBLY,
              currentStatus: 'PENDING',
              readyForDispatch: false,
              finalAssemblyBarcode: serial, // FA barcode = serial number
              returnRequestId: linkedReturn?.id ?? undefined,
            },
          });
        }
      } else {
        // ── MANUFACTURED ITEMS: units start at POWERSTAGE / PENDING ──

        // Check if BOM has board items for PS/BB — if so, barcodes assigned via job card dispatch
        const hasPSBoard = await prisma.bOMItem.findFirst({
          where: { productId: product.id, stage: StageType.POWERSTAGE_MANUFACTURING, isBoard: true },
        });
        const hasBBBoard = await prisma.bOMItem.findFirst({
          where: { productId: product.id, stage: StageType.BRAINBOARD_MANUFACTURING, isBoard: true },
        });

        for (let i = 0; i < qty; i++) {
          const serial    = await generateNextSerial(product.code);
          const qcBarcode = await generateNextQCBarcode(product.code);

          // If BOM has board item → null (assigned via job card dispatch)
          // If no board BOM item → auto-generate (backward compatible)
          const powerstageBarcode = hasPSBoard
            ? null
            : await generateNextPowerstageBarcode(product.code);
          const brainboardBarcode = hasBBBoard
            ? null
            : await generateNextBrainboardBarcode(product.code);

          await prisma.controllerUnit.create({
            data: {
              serialNumber: serial,
              orderId:     order.id,
              productId:   product.id,
              currentStage:  StageType.POWERSTAGE_MANUFACTURING,
              currentStatus: 'PENDING',
              powerstageBarcode,
              brainboardBarcode,
              qcBarcode,
              finalAssemblyBarcode: serial, // FA barcode = serial number
              returnRequestId: linkedReturn?.id ?? undefined,
            },
          });
        }
      }
    }

    // ── Create HarnessUnits if harness is required ──
    // Barcode + serial are NOT assigned here — generated on "Start Crimping"
    // harnessModel comes from per-item (preferred) or proforma-level (backward compat)
    if (harnessRequired && harnessQty > 0) {
      for (const hItem of harnessItems) {
        // Find matching product item to get per-item harness model
        const matchingProductItem = productItems.find(pi =>
          hItem.description?.includes(pi.product!.name) || hItem.description?.includes(pi.product!.code)
        );
        const itemModel = hItem.harnessModel ?? matchingProductItem?.harnessModel ?? proforma.harnessModel ?? null;
        const itemProductId = matchingProductItem?.product?.id ?? primaryProduct.id;
        for (let i = 0; i < hItem.quantity; i++) {
          await prisma.harnessUnit.create({
            data: {
              orderId:      order.id,
              productId:    itemProductId,
              status:       'PENDING',
              harnessModel: itemModel,
            },
          });
        }
      }
      await appendTimeline({
        orderId: order.id,
        userId:  session.id,
        action:  'harness_units_created',
        remarks: `${harnessQty} harness unit(s) created for manufacturing`,
      });
    }

    // Log serials
    const createdUnits = await prisma.controllerUnit.findMany({ where: { orderId: order.id }, orderBy: { serialNumber: 'asc' } });
    for (const u of createdUnits) {
      await appendTimeline({ unitId: u.id, orderId: order.id, userId: session.id, action: 'serial_generated', stage: u.currentStage, remarks: u.serialNumber });
    }

    // Mark PI as converted and link the order
    await prisma.proformaInvoice.update({
      where: { id: params.id },
      data:  { status: 'CONVERTED', orderId: order.id },
    });

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id }, include: { product: true, units: true } });
    return NextResponse.json({ ok: true, order: updatedOrder, proformaId: params.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
