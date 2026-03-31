import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generatePONumber } from '@/lib/procurement-numbers';

// POST /api/procurement/rfq/[id]/sample
// body: { quoteId, action: 'request' | 'approve' | 'reject' }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: rfqId } = await params;
  const { quoteId, action, notes } = await req.json() as { quoteId: string; action: string; notes?: string };

  if (!['request', 'approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const quote = await prisma.vendorQuote.findFirst({ where: { id: quoteId, rfqId } });
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

  const sampleStatus =
    action === 'request' ? 'REQUESTED' :
    action === 'approve' ? 'APPROVED'  : 'REJECTED';

  const updated = await prisma.vendorQuote.update({
    where: { id: quoteId },
    data: {
      sampleStatus,
      ...(action === 'request' ? { sampleRequestedAt: new Date(), sampleNotes: notes ?? null } : {}),
    },
  });

  // ── Auto-create DRAFT PO when lowest bid's sample is approved ──
  let autoPO = null;
  if (action === 'approve') {
    const rfq = await prisma.rFQ.findUnique({
      where: { id: rfqId },
      include: { items: true, quotes: { include: { items: true } } },
    });

    if (rfq && (rfq.status === 'OPEN' || rfq.status === 'CLOSED')) {
      const submittedQuotes = rfq.quotes.filter(q => q.status === 'SUBMITTED' || q.status === 'SELECTED');
      const hasEnough = submittedQuotes.length >= 5;
      const sorted = submittedQuotes.slice().sort((a, b) => a.totalAmount - b.totalAmount);
      const isLowest = sorted.length > 0 && sorted[0].id === quoteId;

      if (hasEnough && isLowest) {
        const poNumber = await generatePONumber();
        const selectedQuote = rfq.quotes.find(q => q.id === quoteId)!;

        autoPO = await prisma.$transaction(async (tx) => {
          // Mark quotes
          await tx.vendorQuote.updateMany({
            where: { rfqId, id: { not: quoteId } },
            data: { status: 'REJECTED' },
          });
          await tx.vendorQuote.update({
            where: { id: quoteId },
            data: { status: 'SELECTED' },
          });

          // Create DRAFT PO (PM must click "Generate PO" to finalize)
          const po = await tx.purchaseOrder.create({
            data: {
              poNumber,
              vendorId: selectedQuote.vendorId,
              rfqId,
              selectedQuoteId: quoteId,
              status: 'DRAFT',
              totalAmount: selectedQuote.totalAmount,
              currency: selectedQuote.currency,
              createdById: session.id,
              items: {
                create: selectedQuote.items.map(qi => {
                  const rfqItem = rfq.items.find(ri => ri.id === qi.rfqItemId);
                  if (qi.materialId) {
                    return { rawMaterialId: qi.materialId, quantity: rfqItem?.qtyRequired ?? 0, unitPrice: qi.unitPrice, receivedQuantity: 0 };
                  }
                  return { rawMaterialId: null, itemDescription: rfqItem?.itemDescription ?? 'Custom Item', itemUnit: rfqItem?.itemUnit ?? null, quantity: rfqItem?.qtyRequired ?? 0, unitPrice: qi.unitPrice, receivedQuantity: 0 };
                }),
              },
            },
          });

          // Close RFQ
          await tx.rFQ.update({ where: { id: rfqId }, data: { status: 'CONVERTED' } });

          return po;
        });
      }
    }
  }

  return NextResponse.json({
    sampleStatus: updated.sampleStatus,
    sampleRequestedAt: updated.sampleRequestedAt,
    ...(autoPO ? { autoPO: { id: autoPO.id, poNumber: autoPO.poNumber, status: autoPO.status } } : {}),
  });
}
