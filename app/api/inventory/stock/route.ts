import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER'] as const;

export async function GET() {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const materials = await prisma.rawMaterial.findMany({
    where:   { active: true },
    orderBy: { name: 'asc' },
    include: {
      category: { select: { id: true, name: true } },
      batches: {
        where:   { remainingQty: { gt: 0 } },
        orderBy: { createdAt: 'asc' }, // FIFO order
        select:  {
          id: true, batchCode: true, quantity: true, remainingQty: true,
          unitPrice: true, condition: true, createdAt: true,
          goodsReceipt: { select: { grnNumber: true, receivedAt: true } },
        },
      },
    },
  });

  const result = materials.map(m => {
    // FIFO stock valuation: sum(remainingQty * unitPrice) per batch
    const stockValue = m.batches.reduce((sum, b) => sum + b.remainingQty * b.unitPrice, 0);
    return {
      ...m,
      stockValue,
      isLowStock: m.currentStock <= m.reorderPoint,
      isCritical: m.currentStock <= m.minimumStock,
      batchCount: m.batches.length,
    };
  });

  const lowStockCount = result.filter(m => m.isLowStock).length;
  const totalValue    = result.reduce((sum, m) => sum + m.stockValue, 0);

  return NextResponse.json({ materials: result, lowStockCount, totalValue });
}
