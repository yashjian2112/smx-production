import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/procurement/purchase-orders/[id]/performance — record vendor performance after GRN
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { deliveredOnTime, qualityRating, pricingScore, notes } = await req.json() as {
    deliveredOnTime: boolean;
    qualityRating: number;   // 1-5
    pricingScore: number;    // 1-5
    notes?: string;
  };

  if (qualityRating < 1 || qualityRating > 5 || pricingScore < 1 || pricingScore > 5) {
    return NextResponse.json({ error: 'Ratings must be between 1 and 5' }, { status: 400 });
  }

  const po = await prisma.purchaseOrder.findUnique({ where: { id: (await params).id } });
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });

  // Upsert (if already recorded, update it)
  const perf = await prisma.vendorPerformance.upsert({
    where: { poId: (await params).id },
    create: {
      vendorId: po.vendorId,
      poId: (await params).id,
      deliveredOnTime,
      qualityRating,
      pricingScore,
      notes: notes ?? null,
      recordedById: session.id,
    },
    update: { deliveredOnTime, qualityRating, pricingScore, notes: notes ?? null },
  });

  // Recalculate vendor's average rating
  const allPerf = await prisma.vendorPerformance.findMany({ where: { vendorId: po.vendorId } });
  const avgRating = allPerf.reduce((s: number, p: { qualityRating: number; pricingScore: number }) => s + (p.qualityRating + p.pricingScore) / 2, 0) / allPerf.length;
  await prisma.vendor.update({ where: { id: po.vendorId }, data: { rating: Math.round(avgRating * 10) / 10 } });

  return NextResponse.json(perf);
}
