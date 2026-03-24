import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/ai/reorder-optimizer
// Analyzes consumption history and suggests optimal reorder point + MOQ per material
// Body: { materialIds?: string[] } — if empty, runs for all active materials
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { materialIds } = body as { materialIds?: string[] };

  const materials = await prisma.rawMaterial.findMany({
    where: {
      active: true,
      ...(materialIds?.length ? { id: { in: materialIds } } : {}),
    },
    select: {
      id: true, name: true, unit: true, reorderPoint: true, minimumOrderQty: true,
      leadTimeDays: true, currentStock: true,
    },
    take: 50, // process in batches
  });

  // Get last 90 days of stock movements (OUT) per material
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600000);
  const movements = await prisma.stockMovement.findMany({
    where: {
      type: 'OUT',
      createdAt: { gte: ninetyDaysAgo },
      rawMaterialId: materialIds?.length ? { in: materialIds } : undefined,
    },
    select: { rawMaterialId: true, quantity: true, createdAt: true },
  });

  // Group consumption by material
  const consumption: Record<string, number[]> = {};
  for (const m of movements) {
    if (!consumption[m.rawMaterialId]) consumption[m.rawMaterialId] = [];
    consumption[m.rawMaterialId].push(m.quantity);
  }

  const suggestions = [];
  for (const mat of materials) {
    const usages = consumption[mat.id] ?? [];
    const totalUsed = usages.reduce((a, b) => a + b, 0);
    const avgDailyUsage = totalUsed / 90;
    const safetyStock = avgDailyUsage * (mat.leadTimeDays + 7); // lead time + 7 day buffer
    const suggestedReorderPoint = Math.ceil(safetyStock);
    const suggestedMOQ = Math.max(mat.minimumOrderQty, Math.ceil(avgDailyUsage * 30)); // at least 30-day supply

    suggestions.push({
      materialId: mat.id,
      materialName: mat.name,
      unit: mat.unit,
      currentReorderPoint: mat.reorderPoint,
      suggestedReorderPoint,
      currentMOQ: mat.minimumOrderQty,
      suggestedMOQ,
      avgDailyUsage: Math.round(avgDailyUsage * 100) / 100,
      totalUsed90Days: totalUsed,
      leadTimeDays: mat.leadTimeDays,
      currentStock: mat.currentStock,
    });
  }

  // Ask AI to validate and add notes for materials with significant changes
  const significant = suggestions.filter(s =>
    Math.abs(s.suggestedReorderPoint - s.currentReorderPoint) > s.currentReorderPoint * 0.2 ||
    s.avgDailyUsage === 0
  );

  let aiNotes: Record<string, string> = {};
  if (significant.length > 0) {
    try {
      const prompt = `You are an inventory optimization expert. Review these materials and provide brief notes (max 15 words each):

${significant.map(s => `- ${s.materialName}: avg daily usage ${s.avgDailyUsage} ${s.unit}, lead time ${s.leadTimeDays}d, suggest reorder at ${s.suggestedReorderPoint} (was ${s.currentReorderPoint})`).join('\n')}

Reply ONLY with JSON: { "materialId": "note", ... } using the exact materialId keys shown above.
Materials: ${JSON.stringify(significant.map(s => ({ id: s.materialId, name: s.materialName })))}`;

      const resp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      });
      aiNotes = JSON.parse((resp.content[0] as { text: string }).text.trim());
    } catch { /* non-fatal */ }
  }

  const results = suggestions.map(s => ({ ...s, aiNote: aiNotes[s.materialId] ?? null }));
  return NextResponse.json({ suggestions: results, analyzedCount: materials.length });
}

// PATCH /api/ai/reorder-optimizer — apply suggested values to materials
export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { updates } = await req.json() as {
    updates: { materialId: string; reorderPoint: number; minimumOrderQty: number }[];
  };

  if (!updates?.length) return NextResponse.json({ error: 'updates required' }, { status: 400 });

  await prisma.$transaction(
    updates.map(u => prisma.rawMaterial.update({
      where: { id: u.materialId },
      data: { reorderPoint: u.reorderPoint, minimumOrderQty: u.minimumOrderQty },
    }))
  );

  return NextResponse.json({ updated: updates.length });
}
