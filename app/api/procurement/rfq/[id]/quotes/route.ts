import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/procurement/rfq/[id]/quotes — vendor submits quote (vendor portal)
// Auth via invite token passed in body
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { token, currency, leadTimeDays, validUntil, notes, fileUrls, items } = body as {
    token: string;
    currency: string;
    leadTimeDays: number;
    validUntil: string;
    notes?: string;
    fileUrls?: string[];
    items: {
      rfqItemId: string;
      materialId?: string | null;
      unitPrice: number;
      qty: number;
      breakdowns?: { factorId: string; amount: number }[];
    }[];
  };

  const invite = await prisma.rFQVendorInvite.findFirst({
    where: { token, rfqId: params.id },
    include: { rfq: true },
  });
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite token' }, { status: 403 });
  if (invite.rfq.status !== 'OPEN') return NextResponse.json({ error: 'RFQ is no longer accepting quotes' }, { status: 400 });

  const existing = await prisma.vendorQuote.findUnique({
    where: { rfqId_vendorId: { rfqId: params.id, vendorId: invite.vendorId } },
  });
  if (existing) return NextResponse.json({ error: 'Quote already submitted. Contact PM to update.' }, { status: 400 });

  // Validate required breakdown factors are all present
  const requiredFactors = await prisma.priceBreakdownFactor.findMany({
    where: { active: true, isRequired: true },
    select: { id: true, name: true },
  });

  if (requiredFactors.length > 0) {
    for (const item of items) {
      const submittedIds = new Set((item.breakdowns ?? []).map(b => b.factorId));
      const missing = requiredFactors.filter(f => !submittedIds.has(f.id));
      if (missing.length > 0) {
        return NextResponse.json({
          error: `Missing required price breakdown: ${missing.map(f => f.name).join(', ')}`
        }, { status: 400 });
      }
    }
  }

  const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

  const quote = await prisma.$transaction(async (tx) => {
    const created = await tx.vendorQuote.create({
      data: {
        rfqId: params.id,
        vendorId: invite.vendorId,
        currency: currency ?? 'INR',
        totalAmount,
        leadTimeDays,
        validUntil: new Date(validUntil),
        notes: notes ?? null,
        fileUrls: fileUrls ?? [],
        status: 'SUBMITTED',
        items: {
          create: items.map(i => ({
            rfqItemId: i.rfqItemId,
            materialId: i.materialId ?? null,
            unitPrice: i.unitPrice,
            currency: currency ?? 'INR',
            totalPrice: i.unitPrice * i.qty,
          })),
        },
      },
      include: { items: true },
    });

    // Save price breakdowns per quote item
    for (const item of items) {
      if (!item.breakdowns?.length) continue;
      const quoteItem = created.items.find(qi => qi.rfqItemId === item.rfqItemId);
      if (!quoteItem) continue;
      await tx.vendorQuoteItemBreakdown.createMany({
        data: item.breakdowns.map(b => ({
          quoteItemId: quoteItem.id,
          factorId: b.factorId,
          amount: b.amount,
        })),
      });
    }

    return created;
  });

  await prisma.rFQVendorInvite.update({
    where: { id: invite.id },
    data: { viewedAt: invite.viewedAt ?? new Date() },
  });

  return NextResponse.json(quote, { status: 201 });
}
