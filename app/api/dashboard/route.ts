import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StageType } from '@prisma/client';

export async function GET() {
  try {
    const session = await requireSession();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (session.role === 'PRODUCTION_EMPLOYEE') {
      const assigned = await prisma.stageAssignment.findMany({
        where: { userId: session.id },
        include: {
          unit: {
            include: { order: { include: { product: true } }, product: true },
          },
        },
      });
      const unitIds = assigned.map((a) => a.unitId);
      const completedToday = await prisma.stageLog.count({
        where: {
          unitId: { in: unitIds },
          userId: session.id,
          statusTo: 'WAITING_APPROVAL',
          createdAt: { gte: today },
        },
      });
      const blocked = await prisma.controllerUnit.count({
        where: {
          id: { in: unitIds },
          currentStatus: 'BLOCKED',
        },
      });
      return NextResponse.json({
        role: 'employee',
        assignedCount: assigned.length,
        completedToday,
        blockedCount: blocked,
        assignedUnits: assigned.map((a) => ({
          ...a.unit,
          stageAssignment: a.stage,
        })),
      });
    }

    const activeOrders = await prisma.order.count({
      where: { status: 'ACTIVE' },
    });
    const byStage = await prisma.controllerUnit.groupBy({
      by: ['currentStage'],
      where: { order: { status: 'ACTIVE' } },
      _count: true,
    });
    const stageMap = Object.fromEntries(byStage.map((s) => [s.currentStage, s._count]));

    const todayOutput = await prisma.stageLog.count({
      where: {
        statusTo: 'APPROVED',
        createdAt: { gte: today },
      },
    });
    const qcPass = await prisma.qCRecord.count({
      where: { result: 'PASS', createdAt: { gte: today } },
    });
    const qcFail = await prisma.qCRecord.count({
      where: { result: 'FAIL', createdAt: { gte: today } },
    });
    const reworkPending = await prisma.reworkRecord.count({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });
    const waitingApproval = await prisma.controllerUnit.count({
      where: { currentStatus: 'WAITING_APPROVAL' },
    });
    const blocked = await prisma.controllerUnit.count({
      where: { currentStatus: 'BLOCKED', order: { status: 'ACTIVE' } },
    });

    return NextResponse.json({
      role: session.role,
      activeOrders,
      byStage: {
        [StageType.POWERSTAGE_MANUFACTURING]: stageMap[StageType.POWERSTAGE_MANUFACTURING] ?? 0,
        [StageType.BRAINBOARD_MANUFACTURING]: stageMap[StageType.BRAINBOARD_MANUFACTURING] ?? 0,
        [StageType.CONTROLLER_ASSEMBLY]: stageMap[StageType.CONTROLLER_ASSEMBLY] ?? 0,
        [StageType.QC_AND_SOFTWARE]: stageMap[StageType.QC_AND_SOFTWARE] ?? 0,
        [StageType.REWORK]: stageMap[StageType.REWORK] ?? 0,
        [StageType.FINAL_ASSEMBLY]: stageMap[StageType.FINAL_ASSEMBLY] ?? 0,
      },
      todayOutput,
      qcPass,
      qcFail,
      reworkPending,
      waitingApproval,
      blockedCount: blocked,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
