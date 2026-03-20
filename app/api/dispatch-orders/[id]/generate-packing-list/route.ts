import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextPackingListNumber } from '@/lib/invoice-number';
import { z } from 'zod';

const schema = z.object({
  slipNumber: z.string().min(1),
});

/**
 * POST /api/dispatch-orders/[id]/generate-packing-list
 * Scan the packing slip barcode to generate the packing list.
 * Marks the packing slip as SCANNED and creates a PackingList record.
 * Also updates the Order status to PARTIALLY_SHIPPED or SHIPPED.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'PACKING', 'ACCOUNTS');

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { slipNumber } = parsed.data;

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      include: {
        packingSlip: {
          include: { packingList: { select: { id: true, listNumber: true } } },
        },
        order: {
          include: {
            dispatchOrders: {
              include: { packingSlip: { include: { packingList: { select: { id: true } } } } },
            },
          },
        },
      },
    });

    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });

    const packingSlip = dispatchOrder.packingSlip;
    if (!packingSlip)
      return NextResponse.json({ error: 'No packing slip found for this dispatch order. Generate packing slip first.' }, { status: 400 });

    if (packingSlip.slipNumber.toUpperCase() !== slipNumber.trim().toUpperCase())
      return NextResponse.json(
        { error: `Packing slip mismatch. Expected: ${packingSlip.slipNumber}` },
        { status: 400 }
      );

    if (packingSlip.packingList)
      return NextResponse.json(
        { error: 'Packing list already generated', packingList: packingSlip.packingList },
        { status: 400 }
      );

    const listNumber = await generateNextPackingListNumber();

    // Create packing list + mark slip as SCANNED in a transaction
    const packingList = await prisma.$transaction(async (tx) => {
      // Mark packing slip as SCANNED
      await tx.packingSlip.update({
        where: { id: packingSlip.id },
        data: { status: 'SCANNED', scannedById: session.id, scannedAt: new Date() },
      });

      // Create packing list
      const pl = await tx.packingList.create({
        data: {
          listNumber,
          packingSlipId:   packingSlip.id,
          dispatchOrderId: params.id,
          generatedById:   session.id,
        },
        include: {
          generatedBy: { select: { name: true } },
        },
      });

      // Check if all DOs for this order now have packing lists
      const allDOs = dispatchOrder.order.dispatchOrders;
      // This DO now has a packing list (count it as having one)
      const withPackingList = allDOs.filter(
        (d) => d.id === params.id || d.packingSlip?.packingList !== null
      ).length;
      const total = allDOs.length;

      const newOrderStatus = withPackingList >= total ? 'SHIPPED' : 'PARTIALLY_SHIPPED';

      await tx.order.update({
        where: { id: dispatchOrder.orderId },
        data: { status: newOrderStatus },
      });

      return pl;
    });

    return NextResponse.json({ packingList }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
