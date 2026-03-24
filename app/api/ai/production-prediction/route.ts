import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STAGES = [
  'POWERSTAGE_MANUFACTURING', 'BRAINBOARD_MANUFACTURING', 'CONTROLLER_ASSEMBLY',
  'QC_AND_SOFTWARE', 'REWORK', 'FINAL_ASSEMBLY',
] as const;

// GET /api/ai/production-prediction?orderId=
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PRODUCTION_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orderId = new URL(req.url).searchParams.get('orderId');
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true, quantity: true, dueDate: true, status: true },
  });
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // Get historical avg time per stage from completed QC records + stage logs timestamps
  // We estimate stage duration as avg time between consecutive stage log entries for same unit
  const stageLogs = await prisma.stageLog.findMany({
    where: { statusTo: 'COMPLETED' },
    select: { stage: true, createdAt: true, unitId: true },
    orderBy: { createdAt: 'desc' },
    take: 1000,
  });

  // For each unit, group logs and estimate time per stage as gap between consecutive logs
  const unitLogs: Record<string, { stage: string; createdAt: Date }[]> = {};
  for (const log of stageLogs) {
    if (!unitLogs[log.unitId]) unitLogs[log.unitId] = [];
    unitLogs[log.unitId].push({ stage: log.stage, createdAt: log.createdAt });
  }

  const stageTimeSums: Record<string, number> = {};
  const stageCounts: Record<string, number> = {};
  for (const [, logs] of Object.entries(unitLogs)) {
    logs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    for (let i = 1; i < logs.length; i++) {
      const hours = (new Date(logs[i].createdAt).getTime() - new Date(logs[i-1].createdAt).getTime()) / 3600000;
      if (hours > 0 && hours < 240) { // ignore gaps > 10 days
        const s = logs[i].stage;
        stageTimeSums[s] = (stageTimeSums[s] ?? 0) + hours;
        stageCounts[s] = (stageCounts[s] ?? 0) + 1;
      }
    }
  }

  const avgHoursPerStage: Record<string, number> = {};
  for (const stage of STAGES) {
    avgHoursPerStage[stage] = stageCounts[stage]
      ? Math.round((stageTimeSums[stage] / stageCounts[stage]) * 10) / 10
      : 8; // default 8h if no data
  }

  // Get active units for this order
  const units = await prisma.controllerUnit.findMany({
    where: { orderId },
    include: {
      stageLogs: { orderBy: { createdAt: 'desc' }, take: 1, select: { stage: true, statusTo: true, createdAt: true } },
    },
  });

  const unitPredictions = units.map(unit => {
    const latestLog = unit.stageLogs[0];
    const currentStage = latestLog?.stage ?? 'POWERSTAGE_MANUFACTURING';
    const currentIdx = STAGES.indexOf(currentStage as typeof STAGES[number]);
    const remainingStages = STAGES.slice(currentIdx === -1 ? 0 : currentIdx);
    const remainingHours = remainingStages.reduce((sum, s) => sum + (avgHoursPerStage[s] ?? 8), 0);
    const estimatedCompletionDate = new Date(Date.now() + remainingHours * 3600000);
    const isDelayed = order.dueDate ? estimatedCompletionDate > new Date(order.dueDate) : false;
    return { unitId: unit.id, serialNumber: unit.serialNumber, currentStage, currentStatus: latestLog?.statusTo ?? 'PENDING', remainingHours, estimatedCompletionDate, isDelayed };
  });

  const delayedCount = unitPredictions.filter(u => u.isDelayed).length;
  const avgMs = unitPredictions.length > 0 ? unitPredictions.reduce((s, u) => s + new Date(u.estimatedCompletionDate).getTime(), 0) / unitPredictions.length : null;
  const avgCompletionDate = avgMs ? new Date(avgMs) : null;

  let aiSummary: string | null = null;
  if (delayedCount > 0) {
    try {
      const resp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 150,
        messages: [{ role: 'user', content: `Order ${order.orderNumber}: ${delayedCount}/${units.length} units may miss due date ${order.dueDate ? new Date(order.dueDate).toDateString() : 'TBD'}. Bottleneck stages: ${JSON.stringify(avgHoursPerStage)}. Give a 2-sentence risk summary + one action.` }],
      });
      aiSummary = (resp.content[0] as { text: string }).text.trim();
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ orderId, orderNumber: order.orderNumber, totalUnits: units.length, delayedCount, avgHoursPerStage, avgCompletionDate, dueDate: order.dueDate, units: unitPredictions, aiSummary });
}
