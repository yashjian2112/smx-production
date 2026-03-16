import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Public route — no auth required; token is the access key
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const invitation = await prisma.bidInvitation.findUnique({
    where: { token: params.token },
    include: {
      vendor: { select: { name: true, code: true } },
      purchaseRequest: {
        include: {
          rawMaterial: { select: { name: true, unit: true } },
          requestedBy: { select: { name: true } },
        },
      },
      bid: true,
    },
  });

  if (!invitation) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
  }

  const now       = new Date();
  const isExpired = invitation.deadline < now;

  return NextResponse.json({
    id:       invitation.id,
    status:   invitation.status,
    deadline: invitation.deadline,
    isExpired,
    vendor:   invitation.vendor,
    purchaseRequest: {
      requestNumber:    invitation.purchaseRequest.requestNumber,
      rawMaterialName:  invitation.purchaseRequest.rawMaterial.name,
      rawMaterialUnit:  invitation.purchaseRequest.rawMaterial.unit,
      quantityRequired: invitation.purchaseRequest.quantityRequired,
      unit:             invitation.purchaseRequest.unit,
      urgency:          invitation.purchaseRequest.urgency,
      notes:            invitation.purchaseRequest.notes,
    },
    existingBid: invitation.bid ? {
      pricePerUnit: invitation.bid.pricePerUnit,
      totalAmount:  invitation.bid.totalAmount,
      leadTimeDays: invitation.bid.leadTimeDays,
      validUntil:   invitation.bid.validUntil,
      notes:        invitation.bid.notes,
      status:       invitation.bid.status,
      submittedAt:  invitation.bid.submittedAt,
    } : null,
  });
}
