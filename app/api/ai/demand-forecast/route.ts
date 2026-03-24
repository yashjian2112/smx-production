import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GET /api/ai/demand-forecast?materialId=&days=30
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const materialId = searchParams.get('materialId');
  const days = parseInt(searchParams.get('days') ?? '30');

  if (!materialId) return NextResponse.json({ error: 'materialId required' }, { status: 400 });

  const mat = await prisma.rawMaterial.findUnique({
    where: { id: materialId },
    select: { id: true, name: true, unit: true, currentStock: true, reorderPoint: true, leadTimeDays: true },
  });
  if (!mat) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

  // Historical daily consumption (last 90 days)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600000);
  const outMovements = await prisma.stockMovement.findMany({
    where: { rawMaterialId: materialId, type: 'OUT', createdAt: { gte: ninetyDaysAgo } },
    select: { quantity: true },
  });
  const totalConsumed = outMovements.reduce((s, m) => s + m.quantity, 0);
  const avgDailyUsage = totalConsumed / 90;

  // Open order demand (units not yet completed × BOM qty for this material)
  const openOrders = await prisma.order.findMany({
    where: { status: { in: ['ACTIVE', 'HOLD'] } },
    select: {
      id: true, orderNumber: true, quantity: true, productId: true,
      units: {
        where: { currentStatus: { notIn: ['APPROVED', 'REJECTED_BACK'] } },
        select: { id: true },
      },
    },
  });

  const bomItems = await prisma.bOMItem.findMany({
    where: { rawMaterialId: materialId },
    select: { productId: true, quantityRequired: true },
  });
  const bomByProduct: Record<string, number> = {};
  for (const b of bomItems) {
    if (b.productId) bomByProduct[b.productId] = b.quantityRequired;
  }

  let openOrderDemand = 0;
  const orderDemandBreakdown: { orderNumber: string; activeUnits: number; bomQty: number; demand: number }[] = [];
  for (const order of openOrders) {
    const activeUnits = order.units.length;
    const bomQty = bomByProduct[order.productId] ?? 0;
    const demand = activeUnits * bomQty;
    if (demand > 0) {
      openOrderDemand += demand;
      orderDemandBreakdown.push({ orderNumber: order.orderNumber, activeUnits, bomQty, demand });
    }
  }

  const historicalForecast = avgDailyUsage * days;
  const totalForecast = Math.max(historicalForecast, openOrderDemand);
  const netRequired = Math.max(0, totalForecast - mat.currentStock);
  const willRunOut = mat.currentStock < totalForecast;
  const daysUntilStockout = avgDailyUsage > 0 ? Math.floor(mat.currentStock / avgDailyUsage) : null;
  const needToOrder = netRequired > 0 && (daysUntilStockout === null || daysUntilStockout <= (mat.leadTimeDays + 7));

  let aiNarrative: string | null = null;
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 120,
      messages: [{ role: 'user', content: `Material: ${mat.name} (${mat.unit}). Stock: ${mat.currentStock}. Avg daily: ${avgDailyUsage.toFixed(2)}/day. Open order demand: ${openOrderDemand}. Days till stockout: ${daysUntilStockout ?? 'N/A'}. Lead time: ${mat.leadTimeDays}d. 2-sentence procurement recommendation.` }],
    });
    aiNarrative = (resp.content[0] as { text: string }).text.trim();
  } catch { /* non-fatal */ }

  return NextResponse.json({
    materialId, materialName: mat.name, unit: mat.unit, currentStock: mat.currentStock,
    avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
    historicalForecast: Math.round(historicalForecast), openOrderDemand: Math.round(openOrderDemand),
    totalForecast: Math.round(totalForecast), netRequired: Math.round(netRequired),
    willRunOut, daysUntilStockout, needToOrder, orderDemandBreakdown, aiNarrative,
  });
}
