import { NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
// FA barcode = serial number (no separate generation needed)
import { StageType, UnitStatus } from '@prisma/client';

/**
 * GET /api/qc/units
 * Returns units currently in QC_AND_SOFTWARE stage + recently completed QC units.
 * QC stage does NOT require manager approval — any WAITING_APPROVAL units are
 * auto-approved (advanced to Final Assembly) immediately on this fetch.
 */
export async function GET() {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'QC_USER', 'PRODUCTION_EMPLOYEE');

    // ── Auto-approve any WAITING_APPROVAL units stuck at QC stage ─────────────
    const stuckUnits = await prisma.controllerUnit.findMany({
      where: { currentStage: 'QC_AND_SOFTWARE', currentStatus: 'WAITING_APPROVAL' },
      select: { id: true, serialNumber: true, qcBarcode: true, product: { select: { code: true } } },
    });

    for (const u of stuckUnits) {
      const faBarcode = u.serialNumber; // FA barcode = serial number
      await prisma.controllerUnit.update({
        where: { id: u.id },
        data: {
          currentStage:         StageType.FINAL_ASSEMBLY,
          currentStatus:        UnitStatus.PENDING,
          ...(faBarcode ? { finalAssemblyBarcode: faBarcode } : {}),
        },
      });
      await prisma.stageLog.create({
        data: {
          unitId:    u.id,
          stage:     StageType.QC_AND_SOFTWARE,
          statusFrom: UnitStatus.WAITING_APPROVAL,
          statusTo:   UnitStatus.APPROVED,
        },
      });
      await appendTimeline({
        unitId:  u.id,
        action:  'approved',
        stage:   StageType.QC_AND_SOFTWARE,
        remarks: 'QC stage auto-approved — no manager sign-off required',
      });
    }

    // ── Active QC units (PENDING, IN_PROGRESS, REJECTED_BACK) ─────────────────
    const activeUnits = await prisma.controllerUnit.findMany({
      where: {
        currentStage:  'QC_AND_SOFTWARE',
        currentStatus: { in: ['PENDING', 'IN_PROGRESS', 'REJECTED_BACK'] },
      },
      select: {
        id: true, serialNumber: true, currentStatus: true, updatedAt: true,
        readyForDispatch: true,
        productId: true,
        assemblyBarcode: true,
        qcBarcode: true,
        order: { select: { id: true, orderNumber: true, product: { select: { id: true, name: true, code: true } } } },
        assignments: {
          where: { stage: 'QC_AND_SOFTWARE' },
          select: { user: { select: { id: true, name: true } } },
          take: 1,
        },
        reworkRecords: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, cycleCount: true, createdAt: true },
        },
      },
      orderBy: [{ currentStatus: 'asc' }, { updatedAt: 'asc' }],
    });

    // ── Completed QC units (pass AND fail, last 1 year) ────────────────────
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const recentQC = await prisma.qCRecord.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        result: true,
        createdAt: true,
        firmwareVersion: true,
        softwareVersion: true,
        checklistData: true,
        unit: {
          select: {
            id: true, serialNumber: true, currentStage: true, currentStatus: true, updatedAt: true,
            qcBarcode: true,
            order: { select: { id: true, orderNumber: true, product: { select: { name: true, code: true } } } },
            assignments: {
              where: { stage: 'QC_AND_SOFTWARE' },
              select: { user: { select: { id: true, name: true } } },
              take: 1,
            },
            // Check for any prior FAIL records to flag as rework
            qcRecords: {
              where: { result: 'FAIL' },
              select: { id: true },
              take: 1,
            },
          },
        },
        user: { select: { id: true, name: true } },
      },
    });

    const activeList = activeUnits.map((u) => ({
      ...u,
      updatedAt:   u.updatedAt.toISOString(),
      assignedTo:  u.assignments[0]?.user ?? null,
      reworkRecord: u.reworkRecords[0] ?? null,
      _type: 'active' as const,
    }));

    const completedList = recentQC.map((r) => ({
      qcResult:      r.result as 'PASS' | 'FAIL',
      id:            r.unit.id,
      serialNumber:  r.unit.serialNumber,
      currentStatus: r.unit.currentStatus,
      currentStage:  r.unit.currentStage,
      updatedAt:     r.createdAt.toISOString(),
      qcBarcode:     r.unit.qcBarcode,
      order:         r.unit.order,
      assignedTo:    r.unit.assignments[0]?.user ?? null,
      qcPassedBy:    r.user,
      firmwareVersion:  r.firmwareVersion,
      softwareVersion:  r.softwareVersion,
      checklistData:    r.checklistData as Record<string, { status: string; value: string }> | null,
      hadRework:        r.unit.qcRecords.length > 0,
      _type: 'completed' as const,
    }));

    return NextResponse.json({ active: activeList, completed: completedList });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[qc/units]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
