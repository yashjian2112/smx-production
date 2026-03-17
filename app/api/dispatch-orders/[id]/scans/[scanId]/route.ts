import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * DELETE /api/dispatch-orders/[id]/scans/[scanId]
 * Remove a staged scan from the DO (before boxes are created).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; scanId: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'PACKING');

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'OPEN')
      return NextResponse.json({ error: 'Can only remove staged scans while DO is OPEN' }, { status: 400 });

    const scan = await prisma.dispatchOrderScan.findUnique({
      where: { id: params.scanId },
      select: { id: true, dispatchOrderId: true },
    });
    if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
    if (scan.dispatchOrderId !== params.id)
      return NextResponse.json({ error: 'Scan does not belong to this dispatch order' }, { status: 400 });

    await prisma.dispatchOrderScan.delete({ where: { id: params.scanId } });

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
