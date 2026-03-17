import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER'] as const;

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : undefined;
  const to   = searchParams.get('to')   ? new Date(searchParams.get('to')!)   : undefined;

  const materials = await prisma.rawMaterial.findMany({
    where:   { active: true },
    orderBy: { name: 'asc' },
    include: {
      category:        { select: { id: true, name: true } },
      preferredVendor: { select: { id: true, name: true } },
      batches: {
        where:   { remainingQty: { gt: 0 } },
        select:  { remainingQty: true, unitPrice: true, expiryDate: true },
      },
      stockMovements: {
        where: {
          ...(from || to ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to   ? { lte: to   } : {}),
            },
          } : {}),
        },
        select: { type: true, quantity: true, createdAt: true },
      },
    },
  });

  // For each material, calculate period summary
  const result = materials.map(m => {
    const movements = m.stockMovements;
    const qtyIn  = movements.filter(mv => mv.type === 'IN').reduce((s, mv) => s + mv.quantity, 0);
    const qtyOut = movements.filter(mv => mv.type === 'OUT').reduce((s, mv) => s + Math.abs(mv.quantity), 0);
    const adjNet = movements.filter(mv => mv.type === 'ADJUSTMENT').reduce((s, mv) => s + mv.quantity, 0);

    // Current FIFO stock value
    const stockValue = m.batches.reduce((s, b) => s + b.remainingQty * b.unitPrice, 0);

    // Closing = currentStock (already maintained by DB)
    const closingQty = m.currentStock;
    // Opening = closing - (in + adj) + out
    const openingQty = closingQty - qtyIn - adjNet + qtyOut;

    // Expiry warnings
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const hasExpired    = m.batches.some(b => b.expiryDate && b.expiryDate < now);
    const hasExpiringSoon = m.batches.some(b => b.expiryDate && b.expiryDate >= now && b.expiryDate <= soon);

    return {
      id:           m.id,
      code:         m.code,
      name:         m.name,
      unit:         m.unit,
      category:     m.category,
      openingQty:   Math.max(0, openingQty),
      qtyIn,
      qtyOut,
      adjNet,
      closingQty,
      stockValue,
      isLowStock:   m.currentStock <= m.reorderPoint,
      isCritical:   m.currentStock <= m.minimumStock,
      hasExpired,
      hasExpiringSoon,
    };
  });

  const totalValue = result.reduce((s, r) => s + r.stockValue, 0);

  return NextResponse.json({ materials: result, totalValue, from, to });
}
