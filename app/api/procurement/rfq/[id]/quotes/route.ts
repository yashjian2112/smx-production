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
    items: { rfqItemId: string; materialId: string; unitPrice: number; qty: number }[];
  };

  // Validate invite token
  const invite = await prisma.rFQVendorInvite.findFirst({
    where: { token, rfqId: params.id },
    include: { rfq: true },
  });
  if (!invite) return NextResponse.json({ error: 'Invalid or expired invite token' }, { status: 403 });
  if (invite.rfq.status !== 'OPEN') return NextResponse.json({ error: 'RFQ is no longer accepting quotes' }, { status: 400 });

  // Check if already submitted
  const existing = await prisma.vendorQuote.findUnique({
    where: { rfqId_vendorId: { rfqId: params.id, vendorId: invite.vendorId } },
  });
  if (existing) return NextResponse.json({ error: 'Quote already submitted. Contact PM to update.' }, { status: 400 });

  const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);

  const quote = await prisma.vendorQuote.create({
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
          materialId: i.materialId,
          unitPrice: i.unitPrice,
          currency: currency ?? 'INR',
          totalPrice: i.unitPrice * i.qty,
        })),
      },
    },
  });

  // Mark invite as viewed/submitted
  await prisma.rFQVendorInvite.update({
    where: { id: invite.id },
    data: { viewedAt: invite.viewedAt ?? new Date() },
  });

  return NextResponse.json(quote, { status: 201 });
}
