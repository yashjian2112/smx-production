import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; boxId: string; itemId: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING');

    // Fetch the dispatch order
    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'PACKING')
      return NextResponse.json({ error: 'Dispatch order must be in PACKING status to remove items' }, { status: 400 });

    // Fetch the box
    const box = await prisma.packingBox.findUnique({
      where: { id: params.boxId },
      select: { id: true, dispatchOrderId: true, isSealed: true },
    });
    if (!box) return NextResponse.json({ error: 'Box not found' }, { status: 404 });
    if (box.dispatchOrderId !== params.id)
      return NextResponse.json({ error: 'Box does not belong to this dispatch order' }, { status: 400 });
    if (box.isSealed)
      return NextResponse.json({ error: 'Cannot remove items from a sealed box' }, { status: 400 });

    // Fetch the item
    const item = await prisma.packingBoxItem.findUnique({
      where: { id: params.itemId },
      select: { id: true, boxId: true },
    });
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    if (item.boxId !== params.boxId)
      return NextResponse.json({ error: 'Item does not belong to this box' }, { status: 400 });

    await prisma.packingBoxItem.delete({ where: { id: params.itemId } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
