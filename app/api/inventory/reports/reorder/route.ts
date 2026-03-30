import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER'] as const;

export async function GET() {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const materials = await prisma.rawMaterial.findMany({
    where:   { active: true },
    orderBy: { name: 'asc' },
    include: {
      category:        { select: { id: true, name: true } },
      preferredVendor: { select: { id: true, name: true } },
      purchaseRequests: {
        where:  { status: { notIn: ['RECEIVED', 'CANCELLED'] } },
        select: { id: true, requestNumber: true, status: true },
        take:   1,
        orderBy:{ createdAt: 'desc' },
      },
      stockMovements: {
        where:   { type: 'IN' },
        orderBy: { createdAt: 'desc' },
        take:    1,
        select:  { createdAt: true, reference: true },
      },
    },
  });

  // Filter correctly (Prisma where with field comparison needs raw or post-filter)
  const lowStock = materials.filter(m => m.currentStock <= m.reorderPoint);

  const result = lowStock.map(m => ({
    id:              m.id,
    code:            m.code,
    name:            m.name,
    unit:            m.unit,
    category:        m.category,
    currentStock:    m.currentStock,
    reorderPoint:    m.reorderPoint,
    minimumStock:    m.minimumStock,
    suggestedQty:    Math.max(0, m.reorderPoint - m.currentStock),
    leadTimeDays:    m.leadTimeDays,
    preferredVendor: m.preferredVendor,
    hasPendingPR:    m.purchaseRequests.length > 0,
    openPR:          m.purchaseRequests[0] ?? null,
    lastReceivedAt:  m.stockMovements[0]?.createdAt ?? null,
    isCritical:      m.currentStock === 0,
  }));

  return NextResponse.json(result);
}
