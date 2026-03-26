import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GET /api/ai/rework-prediction?unitId=
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PRODUCTION_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const unitId = new URL(req.url).searchParams.get('unitId');
  if (!unitId) return NextResponse.json({ error: 'unitId required' }, { status: 400 });

  const unit = await prisma.controllerUnit.findUnique({
    where: { id: unitId },
    include: {
      stageLogs: { orderBy: { createdAt: 'asc' }, select: { stage: true, statusTo: true, createdAt: true } },
      qcRecords: { orderBy: { createdAt: 'desc' }, take: 5, select: { result: true } },
      reworkRecords: { orderBy: { createdAt: 'desc' }, take: 5, select: { id: true } },
    },
  });
  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600000);
  const [totalRecent, reworkRecent] = await Promise.all([
    prisma.controllerUnit.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.reworkRecord.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
  ]);
  const historicalReworkRate = totalRecent > 0 ? reworkRecent / totalRecent : 0;

  const qcFailCount = unit.qcRecords.filter(r => r.result === 'FAIL').length;
  const reworkCount = unit.reworkRecords.length;
  const stageRepeats: Record<string, number> = {};
  for (const log of unit.stageLogs) {
    stageRepeats[log.stage] = (stageRepeats[log.stage] ?? 0) + 1;
  }
  const maxStageRepeats = Math.max(...Object.values(stageRepeats), 0);

  let riskScore = Math.round(historicalReworkRate * 40);
  if (qcFailCount > 0) riskScore += 25 * qcFailCount;
  if (reworkCount > 0) riskScore += 20 * reworkCount;
  if (maxStageRepeats > 1) riskScore += 10 * (maxStageRepeats - 1);
  riskScore = Math.min(riskScore, 100);

  const riskLevel = riskScore >= 70 ? 'HIGH' : riskScore >= 40 ? 'MEDIUM' : 'LOW';

  let aiInsight: string | null = null;
  if (riskScore >= 40) {
    try {
      const resp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 100,
        messages: [{ role: 'user', content: `Unit ${unit.serialNumber}: rework risk ${riskScore}/100. QC fails: ${qcFailCount}, reworks: ${reworkCount}, stage repeats: ${maxStageRepeats}. In 1 sentence, what should PM check before final assembly?` }],
      });
      aiInsight = (resp.content[0] as { text: string }).text.trim();
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ unitId, serialNumber: unit.serialNumber, riskScore, riskLevel, signals: { qcFailCount, reworkCount, maxStageRepeats, historicalReworkRate }, aiInsight });
}
