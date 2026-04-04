import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { UnitStatus } from '@prisma/client';

// GET /api/production/floor
// Returns live floor view data: active units, stage counts, worker count
export async function GET() {
  const session = await requireSession();
  if (!['ADMIN', 'PRODUCTION_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const activeStatuses: UnitStatus[] = [
      UnitStatus.PENDING,
      UnitStatus.IN_PROGRESS,
      UnitStatus.WAITING_APPROVAL,
      UnitStatus.REJECTED_BACK,
      UnitStatus.BLOCKED,
    ];

    // Get all active units with relations
    const units = await prisma.controllerUnit.findMany({
      where: { currentStatus: { in: activeStatuses } },
      select: {
        id: true,
        serialNumber: true,
        currentStage: true,
        currentStatus: true,
        updatedAt: true,
        order: { select: { id: true, orderNumber: true } },
        product: { select: { name: true, code: true } },
        assignments: {
          select: {
            stage: true,
            user: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Count units per stage
    const stageGroups = await prisma.controllerUnit.groupBy({
      by: ['currentStage'],
      where: { currentStatus: { in: activeStatuses } },
      _count: { _all: true },
    });

    const stageCounts: Record<string, number> = {};
    for (const g of stageGroups) {
      stageCounts[g.currentStage] = g._count._all;
    }

    // Count distinct workers with active assignments
    const workerRows = await prisma.stageAssignment.findMany({
      where: {
        unit: {
          currentStatus: { in: [UnitStatus.IN_PROGRESS, UnitStatus.WAITING_APPROVAL] },
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    return NextResponse.json({
      units,
      stageCounts,
      totalActive: units.length,
      totalWorkers: workerRows.length,
      refreshedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Floor API error:', e);
    return NextResponse.json({ error: 'Failed to load floor data' }, { status: 500 });
  }
}
