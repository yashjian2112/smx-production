import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH: seal a box (assign items, photo, seal)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    if (!['PACKING', 'PRODUCTION_EMPLOYEE', 'ADMIN'].includes(session.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const ig = await prisma.implementationGood.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!ig) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (ig.status !== 'PACKING')
      return NextResponse.json({ error: 'IG must be in PACKING status' }, { status: 400 });

    const body = await req.json();
    const { boxId, items, photoUrl } = body;

    if (!boxId) return NextResponse.json({ error: 'boxId required' }, { status: 400 });
    if (!photoUrl) return NextResponse.json({ error: 'photoUrl required for sealing' }, { status: 400 });

    const box = await prisma.iGPackingBox.findUnique({
      where: { id: boxId },
      select: { id: true, igId: true, isSealed: true },
    });
    if (!box || box.igId !== ig.id)
      return NextResponse.json({ error: 'Box not found for this IG' }, { status: 404 });
    if (box.isSealed)
      return NextResponse.json({ error: 'Box already sealed' }, { status: 400 });

    const updated = await prisma.iGPackingBox.update({
      where: { id: boxId },
      data: {
        items: items ? JSON.stringify(items) : null,
        photoUrl,
        isSealed: true,
      },
      select: {
        id: true,
        boxNumber: true,
        label: true,
        items: true,
        isSealed: true,
        photoUrl: true,
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
