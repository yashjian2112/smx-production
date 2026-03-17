import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/dispatch-orders/[id]/reset-packing
// Clears all boxes + scans → resets DO back to OPEN
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING');

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where:  { id: params.id },
      select: { id: true, status: true },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (!['OPEN', 'PACKING'].includes(dispatchOrder.status))
      return NextResponse.json({ error: 'Can only reset OPEN or PACKING orders' }, { status: 400 });

    // Delete box items, boxes, and staging scans
    await prisma.packingBoxItem.deleteMany({ where: { box: { dispatchOrderId: params.id } } });
    await prisma.packingBox.deleteMany({ where: { dispatchOrderId: params.id } });
    await prisma.dispatchOrderScan.deleteMany({ where: { dispatchOrderId: params.id } });

    await prisma.dispatchOrder.update({
      where: { id: params.id },
      data:  { status: 'OPEN', totalBoxes: null },
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
