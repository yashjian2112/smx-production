import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'PACKING');

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where:  { id: params.id },
      select: { id: true, status: true, doNumber: true, boxes: { select: { boxNumber: true } } },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (!['OPEN', 'PACKING'].includes(dispatchOrder.status))
      return NextResponse.json({ error: 'Dispatch order must be OPEN or PACKING to add boxes' }, { status: 400 });

    const nextBoxNumber = dispatchOrder.boxes.length > 0
      ? Math.max(...dispatchOrder.boxes.map((b) => b.boxNumber)) + 1
      : 1;

    const boxLabel = `${dispatchOrder.doNumber}-BOX-${nextBoxNumber}`;

    const [box] = await prisma.$transaction([
      prisma.packingBox.create({
        data: {
          dispatchOrderId: params.id,
          boxNumber:       nextBoxNumber,
          boxLabel,
        },
        include: {
          items: {
            include: { unit: { select: { serialNumber: true, finalAssemblyBarcode: true } } },
          },
          boxSize: true,
        },
      }),
      prisma.dispatchOrder.update({
        where: { id: params.id },
        data:  { status: 'PACKING' },
      }),
    ]);

    return NextResponse.json({ box }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
