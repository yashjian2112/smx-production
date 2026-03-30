import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { notify } from '@/lib/notify';
import { generateNextAssemblyBarcode, generateNextBrainboardBarcode, generateNextQCBarcode, generateNextFinalAssemblyBarcode } from '@/lib/barcode';
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
    requireRole(session, 'ADMIN');
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
      // Notify the assigned employee their work was rejected
      const rejectAssignment = await prisma.stageAssignment.findUnique({
        where: { unitId_stage: { unitId: id, stage: unit.currentStage } },
        select: { userId: true },
      });
      if (rejectAssignment) {
        await notify({
          userId: rejectAssignment.userId,
          type: 'WORK_REJECTED',
          title: 'Work Rejected',
          message: `Your work on ${unit.currentStage.replace(/_/g, ' ')} was rejected. Please check and redo.`,
          relatedModel: 'unit',
          relatedId: id,
        });
      }
      const updated = await prisma.controllerUnit.findUnique({
        where: { id },
        include: { order: true, product: true },
      });
      return NextResponse.json(updated);
    }

    const next = nextStage(unit.currentStage);

    // ── Final stage (FINAL_ASSEMBLY): approve in-place ─────────────────────
    if (!next) {
      await prisma.controllerUnit.update({
        where: { id },
        data: { currentStatus: 'APPROVED' },
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
        metadata: { readyForDispatch: true },
      });
      // Notify the assigned employee their work was approved
      const faAssignment = await prisma.stageAssignment.findUnique({
        where: { unitId_stage: { unitId: id, stage: unit.currentStage } },
        select: { userId: true },
      });
      if (faAssignment) {
        await notify({
          userId: faAssignment.userId,
          type: 'WORK_APPROVED',
          title: 'Work Approved',
          message: `Your ${unit.currentStage.replace(/_/g, ' ')} work was approved. Unit is ready for dispatch.`,
          relatedModel: 'unit',
          relatedId: id,
        });
      }
      const updated = await prisma.controllerUnit.findUnique({
        where: { id },
        include: { order: true, product: true, assignments: { include: { user: true } } },
      });
      return NextResponse.json(updated);
    }

    // ── Intermediate stages: advance to next stage ──────────────────────────
    const product = await prisma.product.findUnique({ where: { id: unit.productId } });
    const updateData: { currentStage: StageType; currentStatus: UnitStatus; brainboardBarcode?: string; assemblyBarcode?: string; qcBarcode?: string; finalAssemblyBarcode?: string } = {
      currentStage: next,
      currentStatus: 'PENDING',
    };
    if (next === StageType.BRAINBOARD_MANUFACTURING && product) {
      updateData.brainboardBarcode = await generateNextBrainboardBarcode(product.code);
    }
    if (next === StageType.CONTROLLER_ASSEMBLY && product) {
      updateData.assemblyBarcode = await generateNextAssemblyBarcode(product.code);
    }
    if (next === StageType.QC_AND_SOFTWARE && product) {
      // Check if QC barcode already exists (may have been pre-generated)
      if (!unit.qcBarcode) {
        updateData.qcBarcode = await generateNextQCBarcode(product.code);
      }
    }
    if (next === StageType.FINAL_ASSEMBLY && product) {
      updateData.finalAssemblyBarcode = await generateNextFinalAssemblyBarcode(product.code);
    }

    await prisma.controllerUnit.update({
      where: { id },
      data: updateData,
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
    // Notify the assigned employee their work was approved and unit advanced
    const midAssignment = await prisma.stageAssignment.findUnique({
      where: { unitId_stage: { unitId: id, stage: unit.currentStage } },
      select: { userId: true },
    });
    if (midAssignment) {
      await notify({
        userId: midAssignment.userId,
        type: 'WORK_APPROVED',
        title: 'Work Approved',
        message: `Your ${unit.currentStage.replace(/_/g, ' ')} work was approved. Unit advanced to ${next.replace(/_/g, ' ')}.`,
        relatedModel: 'unit',
        relatedId: id,
      });
    }

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
