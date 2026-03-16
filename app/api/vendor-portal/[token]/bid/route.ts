import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const bidSchema = z.object({
  pricePerUnit: z.number().positive(),
  leadTimeDays: z.number().int().positive(),
  validUntil:   z.string().min(1),
  notes:        z.string().optional(),
});

// Public — vendor submits bid via their unique token
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const invitation = await prisma.bidInvitation.findUnique({
    where:   { token: params.token },
    include: { purchaseRequest: { select: { quantityRequired: true } } },
  });

  if (!invitation) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  }

  const now = new Date();
  if (invitation.deadline < now) {
    return NextResponse.json({ error: 'Deadline has passed' }, { status: 410 });
  }

  const body = await req.json();
  const data = bidSchema.parse(body);

  const totalAmount = data.pricePerUnit * invitation.purchaseRequest.quantityRequired;

  // Upsert — vendor can update their bid before deadline
  const bid = await prisma.vendorBid.upsert({
    where: { bidInvitationId: invitation.id },
    create: {
      bidInvitationId:   invitation.id,
      purchaseRequestId: invitation.purchaseRequestId,
      vendorId:          invitation.vendorId,
      pricePerUnit:      data.pricePerUnit,
      totalAmount,
      leadTimeDays:      data.leadTimeDays,
      validUntil:        new Date(data.validUntil),
      notes:             data.notes,
      status:            'PENDING',
    },
    update: {
      pricePerUnit: data.pricePerUnit,
      totalAmount,
      leadTimeDays: data.leadTimeDays,
      validUntil:   new Date(data.validUntil),
      notes:        data.notes,
      submittedAt:  new Date(),
    },
  });

  // Mark invitation as submitted
  await prisma.bidInvitation.update({
    where: { id: invitation.id },
    data:  { status: 'SUBMITTED' },
  });

  return NextResponse.json(bid, { status: 201 });
}
