import { NextRequest, NextResponse } from 'next/server';
import { requireSession, isManager } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { StageType, UnitStatus } from '@prisma/client';
import { z } from 'zod';

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const unit = await prisma.controllerUnit.findUnique({
      where: { id },
      include: {
        order: { include: { product: true } },
        product: true,
        assignments: { include: { user: true } },
        stageLogs: { include: { user: true, approvedBy: true }, orderBy: { createdAt: 'desc' } },
        qcRecords: { include: { issueCategory: true } },
        reworkRecords: { include: { rootCauseCategory: true } },
        timelineLogs: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(unit);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const updateSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']).optional(),
  remarks: z.string().optional(),
  assignUserId: z.string().optional(),
  firmwareVersion: z.string().optional(),
  softwareVersion: z.string().optional(),
  /** Set when Assembly employee confirms which PS+BB boards they are physically combining */
  assemblyBrainboardBarcode: z.string().optional(),
  assemblyPowerstageBarcode: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }
    const { status, remarks, assignUserId, firmwareVersion, softwareVersion, assemblyBrainboardBarcode, assemblyPowerstageBarcode } = parsed.data;

    const unit = await prisma.controllerUnit.findUnique({ where: { id } });
    if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updates: {
      currentStatus?: UnitStatus;
      currentStage?: StageType;
      firmwareVersion?: string;
      softwareVersion?: string;
      brainboardBarcode?: string;
      powerstageBarcode?: string;
    } = {};
    let statusFrom = unit.currentStatus;
    let statusTo = unit.currentStatus;

    if (status) {
      statusTo = status as UnitStatus;
      updates.currentStatus = statusTo;
    }
    if (firmwareVersion !== undefined) updates.firmwareVersion = firmwareVersion;
    if (softwareVersion !== undefined) updates.softwareVersion = softwareVersion;

    // Assembly stage: record which PS + BB boards were physically combined
    if (assemblyBrainboardBarcode) {
      updates.brainboardBarcode = assemblyBrainboardBarcode.trim().toUpperCase();
    }
    if (assemblyPowerstageBarcode) {
      updates.powerstageBarcode = assemblyPowerstageBarcode.trim().toUpperCase();
    }
    // Log the assembly pairing as its own timeline event (separate from status change)
    if (assemblyBrainboardBarcode || assemblyPowerstageBarcode) {
      const psLabel = assemblyPowerstageBarcode ?? unit.powerstageBarcode ?? '—';
      const bbLabel = assemblyBrainboardBarcode ?? unit.brainboardBarcode ?? '—';
      await appendTimeline({
        unitId: id,
        userId: session.id,
        action: 'assembly_pairing_recorded',
        stage: StageType.CONTROLLER_ASSEMBLY,
        remarks: `PS: ${psLabel}  |  BB: ${bbLabel}`,
      });
    }

    if (assignUserId && isManager(session)) {
      await prisma.stageAssignment.upsert({
        where: { unitId_stage: { unitId: id, stage: unit.currentStage } },
        create: { unitId: id, userId: assignUserId, stage: unit.currentStage },
        update: { userId: assignUserId },
      });
    }

    if (Object.keys(updates).length > 0) {
      await prisma.stageLog.create({
        data: {
          unitId: id,
          userId: session.id,
          stage: unit.currentStage,
          statusFrom,
          statusTo: updates.currentStatus ?? statusTo,
          remarks: remarks ?? undefined,
        },
      });
      await appendTimeline({
        unitId: id,
        userId: session.id,
        action: 'status_changed',
        stage: unit.currentStage,
        statusFrom,
        statusTo: updates.currentStatus ?? statusTo,
        remarks: remarks ?? undefined,
      });

      // Auto-advance to next stage when current stage is COMPLETED
      // REWORK stage is handled separately via /rework route — skip here
      if (statusTo === 'COMPLETED' && unit.currentStage !== StageType.REWORK) {
        const next = nextStage(unit.currentStage);
        if (next) {
          // Advance to next stage with IN_PROGRESS status (keeps unit active, not pending)
          updates.currentStage = next;
          updates.currentStatus = UnitStatus.IN_PROGRESS;
          await appendTimeline({
            unitId: id,
            userId: session.id,
            action: 'stage_completed',
            stage: next,
            statusFrom: UnitStatus.COMPLETED,
            statusTo: UnitStatus.IN_PROGRESS,
            remarks: `Advanced to ${next}`,
          });
        } else {
          // Final stage (FINAL_ASSEMBLY) completed — mark unit as fully done
          updates.currentStatus = UnitStatus.COMPLETED;
          await appendTimeline({
            unitId: id,
            userId: session.id,
            action: 'final_assembly_completed',
            stage: unit.currentStage,
            statusFrom: UnitStatus.COMPLETED,
            statusTo: UnitStatus.COMPLETED,
            remarks: 'Unit fully assembled and ready for dispatch',
          });
        }
      }
    }

    const updated = await prisma.controllerUnit.update({
      where: { id },
      data: updates,
      include: { order: true, product: true, assignments: { include: { user: true } } },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
