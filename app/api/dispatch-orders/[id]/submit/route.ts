import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'SHIPPING', 'PACKING');

    // Fetch DO with boxes+items
    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      include: {
        boxes: {
          include: {
            _count: { select: { items: true } },
          },
        },
      },
    });

    if (!dispatchOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (dispatchOrder.status !== 'PACKING')
      return NextResponse.json({ error: 'Dispatch order must be in PACKING status to submit' }, { status: 400 });

    // All boxes must be confirmed (isSealed = true)
    const unsealedBoxes = dispatchOrder.boxes.filter((b) => !b.isSealed);
    if (unsealedBoxes.length > 0)
      return NextResponse.json(
        { error: `${unsealedBoxes.length} box(es) are not yet confirmed` },
        { status: 400 }
      );

    // At least 1 unit packed total
    const totalPacked = dispatchOrder.boxes.reduce((sum, b) => sum + b._count.items, 0);
    if (totalPacked === 0)
      return NextResponse.json({ error: 'No units have been packed' }, { status: 400 });

    // Validate packed count matches this DO's planned quantity
    const doQty = dispatchOrder.dispatchQty;
    if (totalPacked < doQty)
      return NextResponse.json(
        { error: `Only ${totalPacked} of ${doQty} planned units have been packed` },
        { status: 400 }
      );

    const updated = await prisma.dispatchOrder.update({
      where: { id: params.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            quantity: true,
            client: { select: { customerName: true, globalOrIndian: true } },
            product: { select: { code: true, name: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
        boxes: {
          orderBy: { boxNumber: 'asc' },
          include: {
            _count: { select: { items: true } },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
