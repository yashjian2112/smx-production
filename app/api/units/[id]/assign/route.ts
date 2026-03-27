import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');
    const { id } = await params;
    const body = await req.json();
    const { userId } = body as { userId: string };

    const unit = await prisma.controllerUnit.findUnique({ where: { id } });
    if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (unit.currentStatus === 'APPROVED' && unit.readyForDispatch)
      return NextResponse.json({ error: 'Unit is already dispatched' }, { status: 400 });

    await prisma.stageAssignment.upsert({
      where: { unitId_stage: { unitId: id, stage: unit.currentStage } },
      create: { unitId: id, userId, stage: unit.currentStage },
      update: { userId },
    });

    const updated = await prisma.controllerUnit.findUnique({
      where: { id },
      include: { assignments: { include: { user: true } } },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
