import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { notify } from '@/lib/notify';
import { StageType } from '@prisma/client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const reworks = await prisma.reworkRecord.findMany({
      where: { unitId: id },
      include: { rootCauseCategory: true, assignedUser: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(reworks);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json();
    const reworkId = body.reworkId as string | undefined;
    const {
      assignedUserId,
      rootCauseStage,
      rootCauseCategoryId,
      correctiveAction,
      status,
    } = body;

    const unit = await prisma.controllerUnit.findUnique({ where: { id } });
    if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const rework = await prisma.reworkRecord.findFirst({
      where: { id: reworkId || undefined, unitId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (!rework) return NextResponse.json({ error: 'Rework record not found' }, { status: 404 });

    const updateData: {
      assignedUserId?: string;
      rootCauseStage?: StageType;
      rootCauseCategoryId?: string;
      correctiveAction?: string;
      status?: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'SENT_TO_QC';
      completedAt?: Date;
    } = {};
    if (assignedUserId !== undefined) updateData.assignedUserId = assignedUserId;
    if (rootCauseStage !== undefined) updateData.rootCauseStage = rootCauseStage as StageType;
    if (rootCauseCategoryId !== undefined) updateData.rootCauseCategoryId = rootCauseCategoryId;
    if (correctiveAction !== undefined) updateData.correctiveAction = correctiveAction;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'COMPLETED' || status === 'SENT_TO_QC') updateData.completedAt = new Date();
    }

    await prisma.reworkRecord.update({
      where: { id: rework.id },
      data: updateData,
    });

    if (status === 'COMPLETED' || status === 'SENT_TO_QC') {
      // Append "R" to serial number to mark unit as reworked (skip if already ends with R)
      if (unit.serialNumber && !unit.serialNumber.endsWith('R')) {
        await prisma.controllerUnit.update({
          where: { id },
          data: { serialNumber: `${unit.serialNumber}R` },
        });
      }

      await appendTimeline({
        unitId: id,
        userId: session.id,
        action: 'rework_completed',
        stage: StageType.REWORK,
        remarks: correctiveAction,
      });
      // Notify managers that rework is done
      const managers = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'PRODUCTION_MANAGER'] }, active: true },
        select: { id: true },
      });
      const managerIds = managers.map(m => m.id).filter(mid => mid !== session.id);
      if (managerIds.length > 0) {
        await notify({
          userId: managerIds[0],
          type: 'REWORK_COMPLETED',
          title: 'Rework Completed',
          message: `Rework finished${status === 'SENT_TO_QC' ? ' — unit sent back to QC for retest.' : '.'}`,
          relatedModel: 'unit',
          relatedId: id,
        });
      }
      if (status === 'SENT_TO_QC') {
        await prisma.controllerUnit.update({
          where: { id },
          data: { currentStage: StageType.QC_AND_SOFTWARE, currentStatus: 'PENDING' },
        });
        await appendTimeline({
          unitId: id,
          userId: session.id,
          action: 'retest_passed',
          stage: StageType.QC_AND_SOFTWARE,
        });
      }
    }

    const updated = await prisma.controllerUnit.findUnique({
      where: { id },
      include: { reworkRecords: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
