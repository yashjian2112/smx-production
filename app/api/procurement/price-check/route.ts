import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const SOFT_WARN_PCT = 3;   // 2-3% — show warning
const HARD_BLOCK_PCT = 15; // 15% — require admin override

export type PriceCheckResult = {
  materialId: string;
  materialName: string;
  quotedPrice: number;
  lastPrice: number | null;
  aiPriceBenchmark: number | null;
  deviationPct: number | null;
  status: 'OK' | 'WARNING' | 'BLOCKED' | 'NO_HISTORY';
  message: string;
};

// POST /api/procurement/price-check
// Body: { items: [{ materialId, unitPrice }] }
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { items } = await req.json() as { items: { materialId: string; unitPrice: number }[] };
  if (!items?.length) return NextResponse.json({ error: 'items required' }, { status: 400 });

  const results: PriceCheckResult[] = [];

  for (const item of items) {
    const mat = await prisma.rawMaterial.findUnique({
      where: { id: item.materialId },
      select: { id: true, name: true, lastPurchasePrice: true, aiPriceBenchmark: true },
    });
    if (!mat) continue;

    const referencePrice = mat.lastPurchasePrice ?? mat.aiPriceBenchmark;

    if (!referencePrice) {
      results.push({
        materialId: mat.id, materialName: mat.name,
        quotedPrice: item.unitPrice, lastPrice: null, aiPriceBenchmark: mat.aiPriceBenchmark,
        deviationPct: null, status: 'NO_HISTORY',
        message: 'No purchase history. Verify price manually or get AI benchmark.',
      });
      continue;
    }

    const deviationPct = ((item.unitPrice - referencePrice) / referencePrice) * 100;
    let status: PriceCheckResult['status'] = 'OK';
    let message = `Within acceptable range (${deviationPct > 0 ? '+' : ''}${deviationPct.toFixed(1)}% vs last price ₹${referencePrice})`;

    if (deviationPct > HARD_BLOCK_PCT) {
      status = 'BLOCKED';
      message = `Price is ${deviationPct.toFixed(1)}% above last purchase price (₹${referencePrice}). Exceeds ${HARD_BLOCK_PCT}% limit — admin override required.`;
    } else if (deviationPct > SOFT_WARN_PCT) {
      status = 'WARNING';
      message = `Price is ${deviationPct.toFixed(1)}% above last purchase price (₹${referencePrice}). Exceeds ${SOFT_WARN_PCT}% soft limit.`;
    } else if (deviationPct < -20) {
      // Suspiciously cheap — could be quality issue
      status = 'WARNING';
      message = `Price is ${Math.abs(deviationPct).toFixed(1)}% below last purchase price. Verify quality.`;
    }

    results.push({
      materialId: mat.id, materialName: mat.name,
      quotedPrice: item.unitPrice, lastPrice: mat.lastPurchasePrice, aiPriceBenchmark: mat.aiPriceBenchmark,
      deviationPct, status, message,
    });
  }

  const hasBlocked = results.some(r => r.status === 'BLOCKED');
  return NextResponse.json({ results, hasBlocked, softWarnPct: SOFT_WARN_PCT, hardBlockPct: HARD_BLOCK_PCT });
}
