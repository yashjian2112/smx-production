import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const VIEW_ROLES = ['ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER', 'INVENTORY_MANAGER'] as const;

export async function GET() {
  const session = await requireSession();
  if (!VIEW_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();

  // All batches with remaining stock > 0
  const batches = await prisma.inventoryBatch.findMany({
    where: { remainingQty: { gt: 0 } },
    include: { rawMaterial: { select: { id: true, name: true, code: true, barcode: true, unit: true, purchasePrice: true, category: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
  });

  // Group by material, bucket by age
  const materialMap: Record<string, {
    id: string; name: string; code: string; barcode: string | null; unit: string; category: string | null;
    bucket0_30: number; bucket31_60: number; bucket61_90: number; bucket90plus: number;
    totalQty: number; totalValue: number;
  }> = {};

  for (const b of batches) {
    const m = b.rawMaterial;
    if (!materialMap[m.id]) {
      materialMap[m.id] = {
        id: m.id, name: m.name, code: m.code, barcode: m.barcode, unit: m.unit,
        category: m.category?.name ?? null,
        bucket0_30: 0, bucket31_60: 0, bucket61_90: 0, bucket90plus: 0,
        totalQty: 0, totalValue: 0,
      };
    }
    const days = Math.floor((now.getTime() - b.createdAt.getTime()) / (1000 * 60 * 60 * 24));
    const qty  = b.remainingQty;
    const val  = qty * (b.unitPrice || m.purchasePrice);
    const row  = materialMap[m.id];

    if (days <= 30)       row.bucket0_30  += qty;
    else if (days <= 60)  row.bucket31_60 += qty;
    else if (days <= 90)  row.bucket61_90 += qty;
    else                  row.bucket90plus += qty;

    row.totalQty   += qty;
    row.totalValue += val;
  }

  const rows = Object.values(materialMap).sort((a, b) => b.totalValue - a.totalValue);
  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0);

  return NextResponse.json({ rows, totalValue });
}
