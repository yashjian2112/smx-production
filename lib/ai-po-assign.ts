import { prisma } from '@/lib/prisma';
import { adminNotify } from '@/lib/admin-notify';
import { generatePONumber } from '@/lib/procurement-numbers';

export type QuoteScore = {
  quoteId: string;
  vendorId: string;
  vendorName: string;
  totalAmount: number;
  currency: string;
  priceScore: number;      // 0-100 (lower price = higher score)
  qualityScore: number;    // 0-100 (based on avg quality rating from past performance)
  onTimeScore: number;     // 0-100 (% of past deliveries on time)
  finalScore: number;      // weighted: price*0.5 + quality*0.3 + onTime*0.2
  isWinner: boolean;
};

export async function aiAssignPO(rfqId: string, createdById: string): Promise<{
  po: { id: string; poNumber: string };
  scores: QuoteScore[];
  winnerQuoteId: string;
}> {
  const rfq = await prisma.rFQ.findUnique({
    where: { id: rfqId },
    include: {
      items: true,
      quotes: {
        where: { status: 'SUBMITTED' },
        include: {
          items: true,
          vendor: {
            include: { performance: true },
          },
        },
      },
    },
  });

  if (!rfq) throw new Error('RFQ not found');
  if (rfq.quotes.length === 0) throw new Error('No submitted quotes to evaluate');

  // ── Score each quote ─────────────────────────────────────────────────────
  const amounts = rfq.quotes.map(q => q.totalAmount);
  const minAmt = Math.min(...amounts);
  const maxAmt = Math.max(...amounts);
  const amtRange = maxAmt - minAmt || 1; // avoid /0

  const scores: QuoteScore[] = rfq.quotes.map(q => {
    const perf = q.vendor.performance;

    // Price score: lowest price = 100, highest = 0
    const priceScore = ((maxAmt - q.totalAmount) / amtRange) * 100;

    // Quality score: average qualityRating (1-5) → 0-100
    const qRatings = perf.filter((p: { qualityRating: number | null }) => p.qualityRating != null).map((p: { qualityRating: number }) => p.qualityRating);
    const qualityScore = qRatings.length > 0
      ? ((qRatings.reduce((a: number, b: number) => a + b, 0) / qRatings.length) - 1) / 4 * 100
      : 50; // default mid-score if no history

    // On-time score: % of deliveries on time → 0-100
    const onTimeRecords = perf.filter((p: { deliveredOnTime: boolean | null }) => p.deliveredOnTime != null);
    const onTimeScore = onTimeRecords.length > 0
      ? (onTimeRecords.filter((p: { deliveredOnTime: boolean | null }) => p.deliveredOnTime).length / onTimeRecords.length) * 100
      : 50; // default mid-score if no history

    const finalScore = priceScore * 0.5 + qualityScore * 0.3 + onTimeScore * 0.2;

    return {
      quoteId: q.id,
      vendorId: q.vendorId,
      vendorName: q.vendor.name,
      totalAmount: q.totalAmount,
      currency: q.currency,
      priceScore: Math.round(priceScore),
      qualityScore: Math.round(qualityScore),
      onTimeScore: Math.round(onTimeScore),
      finalScore: Math.round(finalScore * 10) / 10,
      isWinner: false,
    };
  });

  // Sort by finalScore desc — winner is first
  scores.sort((a, b) => b.finalScore - a.finalScore);
  scores[0].isWinner = true;
  const winner = rfq.quotes.find(q => q.id === scores[0].quoteId)!;

  // ── Create PO ─────────────────────────────────────────────────────────────
  const poNumber = await generatePONumber();

  const po = await prisma.$transaction(async (tx) => {
    // Mark quotes
    await tx.vendorQuote.updateMany({
      where: { rfqId, id: { not: winner.id } },
      data: { status: 'REJECTED' },
    });
    await tx.vendorQuote.update({ where: { id: winner.id }, data: { status: 'SELECTED' } });

    const created = await tx.purchaseOrder.create({
      data: {
        poNumber,
        vendorId: winner.vendorId,
        rfqId,
        selectedQuoteId: winner.id,
        status: 'APPROVED',
        totalAmount: winner.totalAmount,
        currency: winner.currency,
        notes: `Auto-assigned by AI. Score: ${scores[0].finalScore}/100 (Price:${scores[0].priceScore} Quality:${scores[0].qualityScore} OnTime:${scores[0].onTimeScore})`,
        approvedById: createdById,
        approvedAt: new Date(),
        createdById,
        items: {
          create: (winner.items as Array<{ rfqItemId: string; materialId?: string | null; unitPrice: number }>).map(qi => ({
            rawMaterialId: qi.materialId ?? '',
            quantity: (rfq.items as Array<{ id: string; qtyRequired: number }>).find(ri => ri.id === qi.rfqItemId)?.qtyRequired ?? 0,
            unitPrice: qi.unitPrice,
            receivedQuantity: 0,
          })),
        },
      },
    });

    await tx.rFQ.update({ where: { id: rfqId }, data: { status: 'CONVERTED' } });
    return created;
  });

  // ── Notify admin ──────────────────────────────────────────────────────────
  const runnerUp = scores[1];
  const savings = runnerUp ? runnerUp.totalAmount - winner.totalAmount : 0;

  await adminNotify(
    'PO_AUTO_ASSIGNED',
    `PO Auto-Assigned: ${poNumber}`,
    `AI selected ${winner.vendor.name} (score ${scores[0].finalScore}/100) for ${rfq.title}. ` +
    `Total: ${winner.currency === 'USD' ? '$' : '₹'}${winner.totalAmount.toLocaleString('en-IN')}` +
    (savings > 0 ? `. Saved ₹${savings.toLocaleString('en-IN')} vs next quote.` : '.'),
    { poId: po.id, rfqId, vendorId: winner.vendorId, scores },
  );

  return { po: { id: po.id, poNumber }, scores, winnerQuoteId: winner.id };
}
