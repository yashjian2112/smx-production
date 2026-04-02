import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { notify } from '@/lib/notify';
import { generateNextQCBarcode } from '@/lib/barcode';
import { StageType, UnitStatus } from '@prisma/client';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'QC_USER');
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
      // Check if this is a rework unit (has open rework records OR linked ReturnRequest)
      const openRework = await prisma.reworkRecord.findFirst({
        where: { unitId: id, status: { in: ['OPEN', 'IN_PROGRESS', 'SENT_TO_QC'] } },
      });
      const linkedReturn = await prisma.returnRequest.findFirst({
        where: { unitId: id, status: { notIn: ['CLOSED', 'REJECTED'] } },
        select: { id: true },
      });
      // Also check if this unit was created as a replacement (has returnRequestId on the unit itself)
      const unitWithReturn = await prisma.controllerUnit.findUnique({
        where: { id },
        select: { returnRequestId: true },
      });
      const isRework = !!openRework || !!linkedReturn || !!unitWithReturn?.returnRequestId;

      if (isRework) {
        // Rework units skip Final Assembly — go straight to dispatch-ready
        await prisma.controllerUnit.update({
          where: { id },
          data: {
            ...updateData,
            currentStage: StageType.FINAL_ASSEMBLY,
            currentStatus: UnitStatus.APPROVED,
            readyForDispatch: false,
          },
        });
      } else {
        // Fresh units proceed to Final Assembly for FA work
        // Pre-generate FA barcode so the label can be printed for scanning
        const faBarcode = unit.serialNumber; // FA barcode = serial number
        await prisma.controllerUnit.update({
          where: { id },
          data: {
            ...updateData,
            currentStage: StageType.FINAL_ASSEMBLY,
            currentStatus: UnitStatus.PENDING,
            ...(faBarcode ? { finalAssemblyBarcode: faBarcode } : {}),
          },
        });
      }

      // Close any open ReworkRecords for this unit
      await prisma.reworkRecord.updateMany({
        where: { unitId: id, status: { in: ['OPEN', 'IN_PROGRESS', 'SENT_TO_QC'] } },
        data: { status: 'COMPLETED' },
      });

      // If linked to a return request, advance to QC_CHECKED
      if (linkedReturn) {
        await prisma.returnRequest.update({
          where: { id: linkedReturn.id },
          data: { status: 'QC_CHECKED' },
        });
      }
      // Also check replacement unit's linked return request
      if (unitWithReturn?.returnRequestId && !linkedReturn) {
        const replacementReturn = await prisma.returnRequest.findUnique({
          where: { id: unitWithReturn.returnRequestId },
          select: { id: true, status: true },
        });
        if (replacementReturn && !['CLOSED', 'REJECTED'].includes(replacementReturn.status)) {
          await prisma.returnRequest.update({
            where: { id: replacementReturn.id },
            data: { status: 'QC_CHECKED' },
          });
        }
      }
      await prisma.stageLog.create({
        data: {
          unitId: id,
          userId: session.id,
          stage: StageType.QC_AND_SOFTWARE,
          statusFrom: UnitStatus.IN_PROGRESS,
          statusTo: isRework ? UnitStatus.APPROVED : UnitStatus.COMPLETED,
        },
      });
      await appendTimeline({
        unitId: id,
        userId: session.id,
        action: 'qc_passed',
        stage: StageType.QC_AND_SOFTWARE,
        remarks: isRework
          ? 'Rework unit passed QC — ready for dispatch (Final Assembly skipped)'
          : remarks,
      });
      // Notify the QC employee of pass result
      await notify({
        userId: session.id,
        type: 'QC_PASSED',
        title: 'QC Passed',
        message: isRework
          ? 'Rework unit passed QC and is ready for dispatch.'
          : 'Unit passed QC and advanced to Final Assembly.',
        relatedModel: 'unit',
        relatedId: id,
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
      // Check if unit has a linked ReturnRequest
      const linkedReturn = await prisma.returnRequest.findFirst({
        where: { unitId: id, status: { notIn: ['CLOSED', 'REJECTED'] } },
        select: { id: true },
      });

      await prisma.reworkRecord.create({
        data: {
          unitId: id,
          status: 'OPEN',
          rootCauseStage: sourceStage as StageType | undefined,
          assignedUserId: assemblyAssignment?.userId ?? undefined,
          returnRequestId: linkedReturn?.id ?? undefined,
        },
      });

      // If linked to a return request, transition it back to IN_REPAIR
      if (linkedReturn) {
        await prisma.returnRequest.update({
          where: { id: linkedReturn.id },
          data: { status: 'IN_REPAIR' },
        });
      }
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
      // Notify rework assignee (assembly employee) about QC failure
      if (assemblyAssignment?.userId) {
        await notify({
          userId: assemblyAssignment.userId,
          type: 'QC_FAILED',
          title: 'QC Failed — Rework Assigned',
          message: `A unit failed QC and has been assigned to you for rework.${remarks ? ` Issue: ${remarks}` : ''}`,
          relatedModel: 'unit',
          relatedId: id,
        });
      }
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
