/**
 * Utility to auto-create Requirement Orders
 * Called from:
 *   1. Stock deduction (when currentStock < minimumOrderQty after deduction)
 *   2. Job card dispatch (when a component is partially fulfilled)
 */
import { prisma } from '@/lib/prisma';
import { generateRONumber } from '@/lib/procurement-numbers';

interface ROItem {
  materialId: string;
  qtyRequired: number;
  notes?: string;
}

interface CreateROOptions {
  trigger: 'LOW_STOCK' | 'JOB_CARD' | 'MANUAL';
  items: ROItem[];
  jobCardId?: string;
  notes?: string;
}

/**
 * Creates a Requirement Order if one doesn't already exist for these materials.
 * Deduplicates: if a PENDING/APPROVED RO already has this material, skips it.
 */
export async function autoCreateRO(opts: CreateROOptions): Promise<void> {
  if (opts.items.length === 0) return;

  // Find which materials already have open ROs (PENDING or APPROVED)
  const existing = await prisma.requirementOrderItem.findMany({
    where: {
      materialId: { in: opts.items.map(i => i.materialId) },
      ro: { status: { in: ['PENDING', 'APPROVED', 'CONVERTED'] } },
    },
    select: { materialId: true },
  });
  const alreadyCovered = new Set(existing.map(e => e.materialId));

  const newItems = opts.items.filter(i => !alreadyCovered.has(i.materialId));
  if (newItems.length === 0) return;

  // Fetch material names so we can snapshot them on the RO item
  const materialIds = newItems.filter(i => i.materialId).map(i => i.materialId!);
  const materials = await prisma.rawMaterial.findMany({
    where: { id: { in: materialIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(materials.map(m => [m.id, m.name]));

  const roNumber = await generateRONumber();
  await prisma.requirementOrder.create({
    data: {
      roNumber,
      trigger: opts.trigger,
      jobCardId: opts.jobCardId ?? null,
      status: 'PENDING',
      notes: opts.notes ?? null,
      items: {
        create: newItems.map(i => ({
          materialId: i.materialId,
          materialName: i.materialId ? (nameMap.get(i.materialId) ?? null) : null,
          qtyRequired: i.qtyRequired,
          notes: i.notes ?? null,
        })),
      },
    },
  });
}

/**
 * Check all materials and create ROs for those below MOQ.
 * Called periodically or after any stock movement.
 */
export async function checkAndCreateLowStockROs(): Promise<number> {
  const lowStock = await prisma.rawMaterial.findMany({
    where: {
      active: true,
      minimumOrderQty: { gt: 0 },
    },
    select: {
      id: true,
      name: true,
      currentStock: true,
      minimumOrderQty: true,
      reorderPoint: true,
    },
  });

  const needsRO = lowStock.filter(m => m.currentStock <= m.reorderPoint && m.minimumOrderQty > 0);
  if (needsRO.length === 0) return 0;

  await autoCreateRO({
    trigger: 'LOW_STOCK',
    items: needsRO.map(m => ({
      materialId: m.id,
      qtyRequired: m.minimumOrderQty,
      notes: `Auto: stock ${m.currentStock} ≤ reorder point ${m.reorderPoint}`,
    })),
  });

  return needsRO.length;
}
