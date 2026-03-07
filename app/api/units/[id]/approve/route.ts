import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { StageType, UnitStatus } from '@prisma/client';

const STAGE_ORDER: StageType[] = [
  StageType.POWERSTAGE_MANUFACTURING,
  StageType.BRAINBOARD_MANUFACTURING,
  StageType.CONTROLLER_ASSEMBLY,
  StageType.QC_AND_SOFTWARE,
  StageType.FINAL_ASSEMBLY,
];

function nextStage(current: StageType): StageType | null {
  const i = STAGE_ORDER.indexOf(current);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER');
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { action } = body as { action: 'approve' | 'reject' };

    const unit = await prisma.controllerUnit.findUnique({ where: { id } });
    if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (unit.currentStatus !== 'WAITING_APPROVAL') {
      return NextResponse.json({ error: 'Unit not waiting approval' }, { status: 400 });
    }

    if (action === 'reject') {
      await prisma.controllerUnit.update({
        where: { id },
        data: { currentStatus: 'REJECTED_BACK' },
      });
      await prisma.stageLog.create({
        data: {
          unitId: id,
          approvedById: session.id,
          stage: unit.currentStage,
          statusFrom: 'WAITING_APPROVAL',
          statusTo: 'REJECTED_BACK',
        },
      });
      await appendTimeline({
        unitId: id,
        userId: session.id,
        action: 'rejected_back',
        stage: unit.currentStage,
        statusFrom: 'WAITING_APPROVAL',
        statusTo: 'REJECTED_BACK',
      });
      const updated = await prisma.controllerUnit.findUnique({
        where: { id },
        include: { order: true, product: true },
      });
      return NextResponse.json(updated);
    }

    const next = nextStage(unit.currentStage);
    if (!next) {
      return NextResponse.json({ error: 'Already at final stage' }, { status: 400 });
    }

    await prisma.controllerUnit.update({
      where: { id },
      data: { currentStage: next, currentStatus: 'PENDING' },
    });
    await prisma.stageLog.create({
      data: {
        unitId: id,
        approvedById: session.id,
        stage: unit.currentStage,
        statusFrom: 'WAITING_APPROVAL',
        statusTo: 'APPROVED',
      },
    });
    await appendTimeline({
      unitId: id,
      userId: session.id,
      action: 'approved',
      stage: unit.currentStage,
      statusFrom: 'WAITING_APPROVAL',
      statusTo: 'APPROVED',
      metadata: { nextStage: next },
    });

    const updated = await prisma.controllerUnit.findUnique({
      where: { id },
      include: { order: true, product: true, assignments: { include: { user: true } } },
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
