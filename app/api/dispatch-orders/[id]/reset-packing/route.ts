import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/dispatch-orders/[id]/reset-packing
 * Reset a PACKING dispatch order back to OPEN.
 * Deletes all boxes (cascades to box items) and all staged scans.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'PACKING');

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where:  { id: params.id },
      select: { id: true, status: true },
    });
    if (!dispatchOrder)
      return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'PACKING')
      return NextResponse.json({ error: 'Only PACKING orders can be reset' }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      // Delete all boxes (PackingBoxItem cascades via onDelete: Cascade)
      await tx.packingBox.deleteMany({ where: { dispatchOrderId: params.id } });
      // Delete all staged scans
      await tx.dispatchOrderScan.deleteMany({ where: { dispatchOrderId: params.id } });
      // Reset DO to OPEN
      await tx.dispatchOrder.update({
        where: { id: params.id },
        data:  { status: 'OPEN', totalBoxes: null },
      });
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
