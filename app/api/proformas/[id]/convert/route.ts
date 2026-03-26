import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextSerial } from '@/lib/serial';
import { generateNextPowerstageBarcode, generateNextBrainboardBarcode, generateNextQCBarcode } from '@/lib/barcode';
import { StageType } from '@prisma/client';
import { z } from 'zod';

const schema = z.object({
  orderNumber: z.string().min(1),   // e.g. WO-2026-001
  itemIndex:   z.number().int().min(0).default(0), // which PI line item to convert (default: first product item)
});

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

    // Find the target item (first one with a productId if not specified)
    const productItems = proforma.items.filter((i) => i.productId && i.product);
    if (productItems.length === 0)
      return NextResponse.json({ error: 'No product line item found in this invoice to create an order from' }, { status: 400 });

    const targetItem = productItems[Math.min(parsed.data.itemIndex, productItems.length - 1)];
    const product    = targetItem.product!;

    // Check for duplicate order number
    const existingOrder = await prisma.order.findFirst({ where: { orderNumber: parsed.data.orderNumber } });
    if (existingOrder)
      return NextResponse.json({ error: `Order number "${parsed.data.orderNumber}" already exists` }, { status: 400 });

    // Create the production order
    const order = await prisma.order.create({
      data: {
        orderNumber:  parsed.data.orderNumber,
        productId:    product.id,
        clientId:     proforma.clientId,
        quantity:     targetItem.quantity,
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
      remarks: `Converted from Proforma Invoice ${proforma.invoiceNumber}`,
    });

    // Try to allocate PS and BB barcodes from MaterialSerial inventory (Option A).
    const qty = targetItem.quantity;
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
