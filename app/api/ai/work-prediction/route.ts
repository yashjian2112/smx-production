import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/ai/work-prediction?orderId=xxx
// Predicts completion time for an active order based on historical stage durations.
// Uses StageLog entries: stage start = first IN_PROGRESS log, stage end = APPROVED log.
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PRODUCTION_MANAGER', 'SALES'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId');
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      product: { select: { name: true } },
      units: {
        select: {
          id: true,
          currentStatus: true,
          assignments: { select: { stage: true } },
          stageLogs: {
            orderBy: { createdAt: 'asc' },
            select: { stage: true, statusTo: true, createdAt: true },
          },
        },
      },
    },
  });

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // Get historical stage durations from StageLog across all units for same product
  // Pair: first IN_PROGRESS log → first APPROVED log per unit+stage
  const historicalLogs = await prisma.stageLog.findMany({
    where: {
      unit: { order: { productId: order.productId } },
      statusTo: { in: ['IN_PROGRESS', 'APPROVED'] },
    },
    orderBy: { createdAt: 'asc' },
    select: { unitId: true, stage: true, statusTo: true, createdAt: true },
  });

  // Build per-unit+stage timing pairs
  type LogEntry = { stage: string; statusTo: string; createdAt: Date };
  const unitStageMap = new Map<string, LogEntry[]>();
  for (const log of historicalLogs) {
    const key = `${log.unitId}::${log.stage}`;
    if (!unitStageMap.has(key)) unitStageMap.set(key, []);
    unitStageMap.get(key)!.push({ stage: log.stage, statusTo: log.statusTo, createdAt: log.createdAt });
  }

  const stageStats: Record<string, { totalMs: number; count: number }> = {};
  Array.from(unitStageMap.values()).forEach((logs) => {
    const startLog = logs.find((l: LogEntry) => l.statusTo === 'IN_PROGRESS');
    const endLog = logs.find((l: LogEntry) => l.statusTo === 'APPROVED');
    if (!startLog || !endLog) return;
    const ms = endLog.createdAt.getTime() - startLog.createdAt.getTime();
    if (ms <= 0) return;
    const stage = startLog.stage;
    if (!stageStats[stage]) stageStats[stage] = { totalMs: 0, count: 0 };
    stageStats[stage].totalMs += ms;
    stageStats[stage].count += 1;
  });

  const avgHoursPerStage: Record<string, number> = {};
  for (const [stage, stats] of Object.entries(stageStats)) {
    avgHoursPerStage[stage] = stats.count > 0
      ? stats.totalMs / stats.count / (1000 * 60 * 60)
      : 8;
  }

  const stageOrder = [
    'POWERSTAGE_MANUFACTURING',
    'BRAINBOARD_MANUFACTURING',
    'CONTROLLER_ASSEMBLY',
    'QC_AND_SOFTWARE',
    'REWORK',
    'FINAL_ASSEMBLY',
  ];

  const units = order.units;
  const totalUnits = units.length;
  const completedUnits = units.filter(u => u.currentStatus === 'APPROVED').length;
  const remainingUnits = totalUnits - completedUnits;

  // For each active unit, determine which stages are already done and estimate remaining
  let maxPredictedHours = 0;

  for (const unit of units) {
    if (unit.currentStatus === 'APPROVED') continue;

    // Stages that have reached APPROVED status
    const approvedStages = new Set(
      unit.stageLogs
        .filter(l => l.statusTo === 'APPROVED')
        .map(l => l.stage as string)
    );

    const remainingStages = stageOrder.filter(s => !approvedStages.has(s) && s !== 'REWORK');
    const hoursLeft = remainingStages.reduce((sum, stage) => {
      return sum + (avgHoursPerStage[stage] ?? 8);
    }, 0);

    if (hoursLeft > maxPredictedHours) maxPredictedHours = hoursLeft;
  }

  const workingHoursPerDay = 8;
  const workingDays = Math.ceil(maxPredictedHours / workingHoursPerDay);
  const predictedDate = new Date();
  predictedDate.setDate(predictedDate.getDate() + workingDays);

  const totalHistoricalSamples = Object.values(stageStats).reduce((s, v) => s + v.count, 0);

  const stageBreakdown = stageOrder.map(stage => ({
    stage,
    avgHours: avgHoursPerStage[stage] ?? 8,
    hasHistoricalData: !!stageStats[stage],
    sampleCount: stageStats[stage]?.count ?? 0,
  }));

  return NextResponse.json({
    orderId,
    productName: order.product.name,
    totalUnits,
    completedUnits,
    remainingUnits,
    predictedCompletionDate: predictedDate.toISOString(),
    predictedWorkingDays: workingDays,
    confidence: totalHistoricalSamples > 10 ? 'HIGH' : totalHistoricalSamples > 3 ? 'MEDIUM' : 'LOW',
    stageBreakdown,
    note: totalHistoricalSamples < 3 ? 'Limited historical data — prediction based on defaults (8h/stage)' : null,
  });
}
