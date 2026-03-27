import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST: submit packing list (all boxes must be sealed)
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    if (!['PACKING', 'PRODUCTION_EMPLOYEE', 'ADMIN'].includes(session.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const ig = await prisma.implementationGood.findUnique({
      where: { id: params.id },
      select: { id: true, igNumber: true, status: true, boxCount: true },
    });
    if (!ig) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (ig.status !== 'PACKING')
      return NextResponse.json({ error: 'IG must be in PACKING status' }, { status: 400 });

    // Check all boxes are sealed
    const boxes = await prisma.iGPackingBox.findMany({
      where: { igId: ig.id },
      select: { id: true, isSealed: true },
    });

    const unsealedCount = boxes.filter(b => !b.isSealed).length;
    if (unsealedCount > 0)
      return NextResponse.json({ error: `${unsealedCount} box(es) not sealed yet` }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      await tx.implementationGood.update({
        where: { id: ig.id },
        data: { status: 'PACKED' },
      });

      await tx.iGTimeline.create({
        data: {
          igId: ig.id,
          status: 'PACKED',
          action: `Packing complete — ${boxes.length} box(es) sealed, packing list submitted`,
          userId: session.id,
        },
      });
    });

    return NextResponse.json({ success: true, status: 'PACKED' });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
