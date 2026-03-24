import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { adminNotify } from '@/lib/admin-notify';

// POST /api/procurement/rfq/[id]/override-request
// PM requests to override AI PO selection with a different quote
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { aiWinnerId, desiredQuoteId, reason } = await req.json() as {
    aiWinnerId: string;
    desiredQuoteId: string;
    reason: string;
  };

  if (!reason?.trim()) return NextResponse.json({ error: 'Reason required for override' }, { status: 400 });
  if (!desiredQuoteId) return NextResponse.json({ error: 'desiredQuoteId required' }, { status: 400 });

  const rfq = await prisma.rFQ.findUnique({ where: { id: (await params).id }, select: { title: true, rfqNumber: true } });
  if (!rfq) return NextResponse.json({ error: 'RFQ not found' }, { status: 404 });

  const [aiQuote, desiredQuote] = await Promise.all([
    prisma.vendorQuote.findUnique({ where: { id: aiWinnerId }, include: { vendor: { select: { name: true } } } }),
    prisma.vendorQuote.findUnique({ where: { id: desiredQuoteId }, include: { vendor: { select: { name: true } } } }),
  ]);

  const override = await prisma.pOOverrideRequest.create({
    data: {
      rfqId: (await params).id,
      requestedById: session.id,
      reason: reason.trim(),
      aiWinnerId,
      desiredId: desiredQuoteId,
      status: 'PENDING',
    },
  });

  await adminNotify(
    'OVERRIDE_REQUEST',
    `Override Request: ${rfq.rfqNumber}`,
    `${session.role === 'ADMIN' ? 'Admin' : 'Purchase Manager'} wants to override AI selection. ` +
    `AI picked: ${aiQuote?.vendor.name} (${aiQuote?.currency === 'USD' ? '$' : '₹'}${aiQuote?.totalAmount}). ` +
    `Wants: ${desiredQuote?.vendor.name} (${desiredQuote?.currency === 'USD' ? '$' : '₹'}${desiredQuote?.totalAmount}). ` +
    `Reason: ${reason}`,
    { overrideId: override.id, rfqId: (await params).id },
  );

  return NextResponse.json(override, { status: 201 });
}
