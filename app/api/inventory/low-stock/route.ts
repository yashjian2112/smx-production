import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER', 'INVENTORY_MANAGER'] as const;

export async function GET() {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const materials = await prisma.rawMaterial.findMany({
    where: {
      active: true,
      // currentStock <= reorderPoint (Prisma raw comparison)
      AND: [{ reorderPoint: { gt: 0 } }],
    },
    include: {
      category: { select: { name: true } },
      purchaseRequests: {
        where:  { status: { notIn: ['RECEIVED', 'CANCELLED'] } },
        select: { id: true, requestNumber: true, status: true, quantityRequired: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  // Filter in JS since Prisma can't compare two fields of same model directly
  const lowStock = materials.filter(m => m.currentStock <= m.reorderPoint);

  return NextResponse.json(
    lowStock.map(m => ({
      ...m,
      shortfall:    m.reorderPoint - m.currentStock,
      hasOpenPR:    m.purchaseRequests.length > 0,
      isCritical:   m.currentStock <= m.minimumStock,
    }))
  );
}
