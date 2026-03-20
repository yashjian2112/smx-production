import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextPackingSlipNumber } from '@/lib/invoice-number';

/**
 * POST /api/dispatch-orders/[id]/generate-packing-slip
 * Generate a packing slip for this DO.
 * Requires: DO is DISPATCHED and all boxes are confirmed (isSealed = true).
 * Returns the created PackingSlip with its number.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'PACKING');

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      include: {
        boxes: {
          select: { id: true, isSealed: true, _count: { select: { items: true } } },
        },
        packingSlip: { select: { id: true, slipNumber: true } },
      },
    });

    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (!['DISPATCHED', 'PACKING'].includes(dispatchOrder.status))
      return NextResponse.json({ error: 'Dispatch order must be in DISPATCHED or PACKING status' }, { status: 400 });
    if (dispatchOrder.packingSlip)
      return NextResponse.json({ error: 'Packing slip already generated', packingSlip: dispatchOrder.packingSlip }, { status: 400 });

    const boxes = dispatchOrder.boxes;
    if (boxes.length === 0)
      return NextResponse.json({ error: 'No boxes found — create boxes first' }, { status: 400 });

    const unsealedBoxes = boxes.filter((b) => !b.isSealed);
    if (unsealedBoxes.length > 0)
      return NextResponse.json(
        { error: `${unsealedBoxes.length} box(es) not yet confirmed. Confirm all boxes before generating packing slip.` },
        { status: 400 }
      );

    const totalItems = boxes.reduce((s, b) => s + b._count.items, 0);
    if (totalItems === 0)
      return NextResponse.json({ error: 'No items packed in boxes' }, { status: 400 });

    const slipNumber = await generateNextPackingSlipNumber();

    const packingSlip = await prisma.packingSlip.create({
      data: {
        slipNumber,
        dispatchOrderId: params.id,
        generatedById:   session.id,
        status:          'GENERATED',
      },
      include: {
        generatedBy: { select: { name: true } },
      },
    });

    return NextResponse.json({ packingSlip }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
