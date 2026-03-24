import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generatePONumber } from '@/lib/procurement-numbers';

// POST /api/procurement/rfq/[id]/po — PM selects winning quote and creates PO
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { selectedQuoteId, expectedDelivery, notes } = body as {
    selectedQuoteId: string;
    expectedDelivery?: string;
    notes?: string;
  };

  const rfq = await prisma.rFQ.findUnique({
    where: { id: (await params).id },
    include: { items: true, quotes: { include: { items: true } } },
  });
  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 });
  if (rfq.status !== 'OPEN' && rfq.status !== 'CLOSED') {
    return NextResponse.json({ error: 'RFQ must be OPEN or CLOSED to create PO' }, { status: 400 });
  }

  const selectedQuote = rfq.quotes.find((q: { id: string }) => q.id === selectedQuoteId);
  if (!selectedQuote) return NextResponse.json({ error: 'Quote not found in this RFQ' }, { status: 404 });

  const poNumber = await generatePONumber();

  const po = await prisma.$transaction(async (tx) => {
    // Mark selected quote as SELECTED, others as REJECTED
    await tx.vendorQuote.updateMany({
      where: { rfqId: (await params).id, id: { not: selectedQuoteId } },
      data: { status: 'REJECTED' },
    });
    await tx.vendorQuote.update({
      where: { id: selectedQuoteId },
      data: { status: 'SELECTED' },
    });

    // Create PO
    const created = await tx.purchaseOrder.create({
      data: {
        poNumber,
        vendorId: selectedQuote.vendorId,
        rfqId: (await params).id,
        selectedQuoteId,
        status: 'APPROVED',
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
        totalAmount: selectedQuote.totalAmount,
        currency: selectedQuote.currency,
        notes: notes ?? null,
        approvedById: session.id,
        approvedAt: new Date(),
        createdById: session.id,
        items: {
          create: (selectedQuote.items as Array<{ rfqItemId: string; materialId: string; unitPrice: number }>).map(qi => ({
            rawMaterialId: qi.materialId,
            quantity: (rfq.items as Array<{ id: string; qtyRequired: number }>).find(ri => ri.id === qi.rfqItemId)?.qtyRequired ?? 0,
            unitPrice: qi.unitPrice,
            receivedQuantity: 0,
          })),
        },
      },
    });

    // Close RFQ
    await tx.rFQ.update({ where: { id: (await params).id }, data: { status: 'CONVERTED' } });

    return created;
  });

  return NextResponse.json(po, { status: 201 });
}
