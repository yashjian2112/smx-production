import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextSerial } from '@/lib/serial';
import { generateNextPowerstageBarcode, generateNextBrainboardBarcode, generateNextQCBarcode } from '@/lib/barcode';
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

    // Find ALL product items (exclude freight/service lines)
    const productItems = proforma.items.filter((i) => i.productId && i.product);
    if (productItems.length === 0)
      return NextResponse.json({ error: 'No product line item found in this invoice to create an order from' }, { status: 400 });

    // Check if this proforma is linked to a ReturnRequest (replacement order)
    const linkedReturn = await prisma.returnRequest.findFirst({
      where: { proformaId: proforma.id },
      select: { id: true },
    });

    const notesText = parsed.data.notes?.trim();
    const createdOrders: any[] = [];

    // Create one order per product item
    for (const targetItem of productItems) {
      const product = targetItem.product!;
      const qty = targetItem.quantity;

      const orderNumber = parsed.data.orderNumber && productItems.length === 1
        ? parsed.data.orderNumber.trim()
        : await generateNextOrderNumber();

      // Check for duplicate order number
      const existingOrder = await prisma.order.findFirst({ where: { orderNumber } });
      if (existingOrder)
        return NextResponse.json({ error: `Order number "${orderNumber}" already exists` }, { status: 400 });

      // Create the production order
      const order = await prisma.order.create({
        data: {
          orderNumber,
          productId:    product.id,
          clientId:     proforma.clientId,
          quantity:     qty,
          priority:     0,
          status:       'ACTIVE',
          createdById:  session.id,
        },
        include: { product: true },
      });

      await appendTimeline({
        orderId: order.id,
        userId:  session.id,
        action:  'order_created',
        remarks: `Converted from Proforma Invoice ${proforma.invoiceNumber} — ${product.code} x${qty}${notesText ? ` — Notes: ${notesText}` : ''}`,
      });

      // Try to allocate PS and BB barcodes from MaterialSerial inventory
      const availablePS = await prisma.materialSerial.findMany({
        where: { stageType: 'PS', status: 'CONFIRMED' },
        orderBy: { createdAt: 'asc' },
        take: qty,
      });
      const availableBB = await prisma.materialSerial.findMany({
        where: { stageType: 'BB', status: 'CONFIRMED' },
        orderBy: { createdAt: 'asc' },
        take: qty,
      });
      const useInventoryPS = availablePS.length >= qty;
      const useInventoryBB = availableBB.length >= qty;

      // Generate units
      for (let i = 0; i < qty; i++) {
        const serial    = await generateNextSerial(product.code);
        const qcBarcode = await generateNextQCBarcode(product.code);
        const powerstageBarcode = useInventoryPS
          ? availablePS[i].barcode
          : await generateNextPowerstageBarcode(product.code);
        const brainboardBarcode = useInventoryBB
          ? availableBB[i].barcode
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
            returnRequestId: linkedReturn?.id ?? undefined,
          },
        });
      }

      // Mark allocated MaterialSerials
      if (useInventoryPS) {
        await prisma.materialSerial.updateMany({
          where: { id: { in: availablePS.slice(0, qty).map(s => s.id) } },
          data: { status: 'ALLOCATED', allocatedToOrderId: order.id },
        });
      }
      if (useInventoryBB) {
        await prisma.materialSerial.updateMany({
          where: { id: { in: availableBB.slice(0, qty).map(s => s.id) } },
          data: { status: 'ALLOCATED', allocatedToOrderId: order.id },
        });
      }

      // Log serials
      const createdUnits = await prisma.controllerUnit.findMany({ where: { orderId: order.id }, orderBy: { serialNumber: 'asc' } });
      for (const u of createdUnits) {
        await appendTimeline({ unitId: u.id, orderId: order.id, userId: session.id, action: 'serial_generated', stage: u.currentStage, remarks: u.serialNumber });
      }

      createdOrders.push(order);
    }

    // Link PI to the first order (primary) and mark as converted
    await prisma.proformaInvoice.update({
      where: { id: params.id },
      data:  { status: 'CONVERTED', orderId: createdOrders[0].id },
    });

    const updatedOrder = await prisma.order.findUnique({ where: { id: createdOrders[0].id }, include: { product: true, units: true } });
    return NextResponse.json({
      ok: true,
      order: updatedOrder,
      orders: createdOrders.map(o => ({ id: o.id, orderNumber: o.orderNumber, product: o.product?.code, quantity: o.quantity })),
      proformaId: params.id,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
