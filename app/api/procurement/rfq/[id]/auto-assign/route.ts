import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generatePONumber } from '@/lib/procurement-numbers';

// POST /api/procurement/rfq/[id]/auto-assign
// AI selects best vendor based on weighted score: Price 50% + Vendor Rating 30% + On-Time Delivery 20%
// Creates PO automatically, rejects other quotes.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const rfq = await prisma.rFQ.findUnique({
    where: { id },
    include: {
      items: true,
      quotes: {
        where: { status: 'SUBMITTED' },
        include: {
          vendor: { select: { id: true, name: true, rating: true } },
          items: true,
        },
      },
    },
  });

  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 });
  if (rfq.status !== 'OPEN' && rfq.status !== 'CLOSED') {
    return NextResponse.json({ error: `RFQ is ${rfq.status}, cannot auto-assign` }, { status: 400 });
  }

  const quotes = rfq.quotes as any[];
  if (quotes.length === 0) {
    return NextResponse.json({ error: 'No submitted quotes to evaluate' }, { status: 400 });
  }

  // --- AI Scoring ---
  // Get all submitted totals
  const totals = quotes.map((q: any) => q.totalAmount as number);
  const minPrice = Math.min(...totals);
  const maxPrice = Math.max(...totals);
  const priceRange = maxPrice - minPrice || 1;

  // Fetch vendor performance records for on-time delivery calculation
  const vendorIds = quotes.map((q: any) => q.vendorId as string);
  const performances = await prisma.vendorPerformance.findMany({
    where: { vendorId: { in: vendorIds } },
    select: { vendorId: true, deliveredOnTime: true },
  });

  // Group performance records by vendor to compute on-time ratio
  const perfByVendor = new Map<string, { total: number; onTime: number }>();
  for (const p of performances) {
    const existing = perfByVendor.get(p.vendorId) ?? { total: 0, onTime: 0 };
    existing.total += 1;
    if (p.deliveredOnTime) existing.onTime += 1;
    perfByVendor.set(p.vendorId, existing);
  }

  const scored = quotes.map((q: any) => {
    const total = q.totalAmount as number;
    // Price score: lower price = higher score (0-100)
    const priceScore = maxPrice === minPrice ? 100 : ((maxPrice - total) / priceRange) * 100;

    // Vendor rating score (0-100), default 60 if no rating
    const vendor = q.vendor as any;
    const ratingScore = vendor.rating ? (vendor.rating / 5) * 100 : 60;

    // On-time delivery score (0-100), default 70 if no history
    const perf = perfByVendor.get(q.vendorId as string);
    const onTimeScore = perf && perf.total > 0
      ? (perf.onTime / perf.total) * 100
      : 70;

    // Weighted composite score
    const finalScore = priceScore * 0.5 + ratingScore * 0.3 + onTimeScore * 0.2;

    return { quote: q, priceScore, ratingScore, onTimeScore, finalScore, total };
  });

  // Sort descending by finalScore — winner is first
  scored.sort((a: any, b: any) => b.finalScore - a.finalScore);
  const winner = scored[0];

  // Create PO from winning quote
  const poNumber = await generatePONumber();

  const po = await prisma.$transaction(async (tx) => {
    // Create PO
    const newPO = await tx.purchaseOrder.create({
      data: {
        poNumber,
        vendorId: winner.quote.vendorId,
        rfqId: id,
        selectedQuoteId: winner.quote.id,
        currency: winner.quote.currency ?? 'INR',
        totalAmount: winner.total,
        status: 'APPROVED',
        approvedById: session.id,
        approvedAt: new Date(),
        createdById: session.id,
        notes: `Auto-assigned by AI. Score: ${winner.finalScore.toFixed(1)} (Price: ${winner.priceScore.toFixed(1)}, Rating: ${winner.ratingScore.toFixed(1)}, OnTime: ${winner.onTimeScore.toFixed(1)})`,
        items: {
          create: (winner.quote.items as any[]).map((qi: any) => {
            const rfqItem = rfq.items.find((ri: any) => ri.id === qi.rfqItemId);
            return {
              rawMaterialId: rfqItem?.materialId ?? qi.materialId,
              quantity: rfqItem?.qtyRequired ?? 0,
              unitPrice: qi.unitPrice,
            };
          }),
        },
      },
      include: {
        vendor: { select: { name: true, code: true } },
        items: true,
      },
    });

    // Reject all other quotes
    const loserIds = quotes
      .filter((q: any) => q.id !== winner.quote.id)
      .map((q: any) => q.id as string);

    if (loserIds.length > 0) {
      await tx.vendorQuote.updateMany({
        where: { id: { in: loserIds } },
        data: { status: 'REJECTED' },
      });
    }

    // Mark winning quote as selected
    await tx.vendorQuote.update({
      where: { id: winner.quote.id },
      data: { status: 'SELECTED' },
    });

    // Close RFQ
    await tx.rFQ.update({
      where: { id },
      data: { status: 'CONVERTED' },
    });

    return newPO;
  });

  return NextResponse.json({
    po,
    aiDecision: {
      winner: {
        vendorName: winner.quote.vendor.name,
        totalAmount: winner.total,
        finalScore: winner.finalScore,
        breakdown: {
          priceScore: winner.priceScore,
          ratingScore: winner.ratingScore,
          onTimeScore: winner.onTimeScore,
        },
      },
      allScores: scored.map((s: any) => ({
        vendorName: s.quote.vendor.name,
        totalAmount: s.total,
        finalScore: s.finalScore,
      })),
    },
  }, { status: 201 });
}
