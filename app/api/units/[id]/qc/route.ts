import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextQCBarcode } from '@/lib/barcode';
import { StageType, UnitStatus } from '@prisma/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json();
    const {
      result,
      sourceStage,
      issueCategoryId,
      remarks,
      firmwareVersion,
      softwareVersion,
      checklistData,
    } = body as {
      result: 'PASS' | 'FAIL';
      sourceStage?: string;
      issueCategoryId?: string;
      remarks?: string;
      firmwareVersion?: string;
      softwareVersion?: string;
      checklistData?: Record<string, { status: string; value: string }>;
    };

    if (!result || !['PASS', 'FAIL'].includes(result)) {
      return NextResponse.json({ error: 'result must be PASS or FAIL' }, { status: 400 });
    }

    const unit = await prisma.controllerUnit.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (unit.currentStage !== StageType.QC_AND_SOFTWARE) {
      return NextResponse.json({ error: 'Unit not at QC stage' }, { status: 400 });
    }

    // Assign QC barcode on first QC test (printed on QC test report)
    let qcBarcode = unit.qcBarcode;
    if (!qcBarcode && unit.product) {
      qcBarcode = await generateNextQCBarcode(unit.product.code);
      await prisma.controllerUnit.update({ where: { id }, data: { qcBarcode } });
    }

    await prisma.qCRecord.create({
      data: {
        unitId: id,
        userId: session.id,
        result,
        detectedAtStage: StageType.QC_AND_SOFTWARE,
        sourceStage: sourceStage as StageType | undefined,
        issueCategoryId: issueCategoryId || undefined,
        remarks: remarks || undefined,
        firmwareVersion: firmwareVersion ?? unit.firmwareVersion,
        softwareVersion: softwareVersion ?? unit.softwareVersion,
        checklistData: checklistData ?? undefined,
      },
    });

    const updateData: {
      currentStatus?: UnitStatus;
      firmwareVersion?: string;
      softwareVersion?: string;
    } = {};
    if (firmwareVersion !== undefined) updateData.firmwareVersion = firmwareVersion;
    if (softwareVersion !== undefined) updateData.softwareVersion = softwareVersion;

    if (result === 'PASS') {
      await prisma.controllerUnit.update({
        where: { id },
        data: {
          ...updateData,
          currentStage: StageType.FINAL_ASSEMBLY,
          currentStatus: UnitStatus.PENDING,
        },
      });
      await prisma.stageLog.create({
        data: {
          unitId: id,
          userId: session.id,
          stage: StageType.QC_AND_SOFTWARE,
          statusFrom: UnitStatus.IN_PROGRESS,
          statusTo: UnitStatus.COMPLETED,
        },
      });
      await appendTimeline({
        unitId: id,
        userId: session.id,
        action: 'qc_passed',
        stage: StageType.QC_AND_SOFTWARE,
        remarks,
      });
    } else {
      // ── REJECT: find Assembly employee and assign rework to them ──────────
      const assemblyAssignment = await prisma.stageAssignment.findUnique({
        where: { unitId_stage: { unitId: id, stage: StageType.CONTROLLER_ASSEMBLY } },
        select: { userId: true },
      });

      updateData.currentStatus = UnitStatus.BLOCKED;
      await prisma.controllerUnit.update({
        where: { id },
        data: updateData,
      });
      await prisma.stageLog.create({
        data: {
          unitId: id,
          userId: session.id,
          stage: StageType.QC_AND_SOFTWARE,
          statusFrom: UnitStatus.IN_PROGRESS,
          statusTo: UnitStatus.BLOCKED,
        },
      });
      await prisma.reworkRecord.create({
        data: {
          unitId: id,
          status: 'OPEN',
          rootCauseStage: sourceStage as StageType | undefined,
          // Assign rework to the employee who built the controller
          assignedUserId: assemblyAssignment?.userId ?? undefined,
        },
      });
      await appendTimeline({
        unitId: id,
        userId: session.id,
        action: 'qc_failed',
        stage: StageType.QC_AND_SOFTWARE,
        remarks,
        metadata: {
          sourceStage: sourceStage ?? undefined,
          assignedBackTo: assemblyAssignment?.userId ?? null,
        },
      });
    }

    const updated = await prisma.controllerUnit.findUnique({
      where: { id },
      include: { order: true, product: true, qcRecords: true, reworkRecords: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[QC route]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
