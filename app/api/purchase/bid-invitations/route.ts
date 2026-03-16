import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

const inviteSchema = z.object({
  purchaseRequestId: z.string().min(1),
  vendorIds:         z.array(z.string().min(1)).min(1),
  deadline:          z.string().min(1), // ISO date string
});

const awardSchema = z.object({
  bidInvitationId: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();

  // Handle award action
  if (body.action === 'award') {
    const { bidInvitationId } = awardSchema.parse({ bidInvitationId: body.bidInvitationId });

    const invitation = await prisma.bidInvitation.findUnique({
      where:   { id: bidInvitationId },
      include: { bid: true, purchaseRequest: true },
    });
    if (!invitation) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    if (!invitation.bid) return NextResponse.json({ error: 'No bid submitted' }, { status: 400 });

    // Mark this bid as selected, reject others, update PR status
    await prisma.$transaction([
      prisma.vendorBid.update({
        where: { id: invitation.bid.id },
        data:  { status: 'SELECTED' },
      }),
      prisma.vendorBid.updateMany({
        where: {
          purchaseRequestId: invitation.purchaseRequestId,
          id:                { not: invitation.bid.id },
        },
        data: { status: 'REJECTED' },
      }),
      prisma.purchaseRequest.update({
        where: { id: invitation.purchaseRequestId },
        data:  { status: 'AWARDED' },
      }),
    ]);

    return NextResponse.json({ success: true });
  }

  // Handle invite vendors
  const data = inviteSchema.parse(body);

  const deadline = new Date(data.deadline);

  // Create invitations for each vendor (skip existing)
  const existing = await prisma.bidInvitation.findMany({
    where: { purchaseRequestId: data.purchaseRequestId },
    select: { vendorId: true },
  });
  const existingVendorIds = new Set(existing.map((e) => e.vendorId));

  const newVendorIds = data.vendorIds.filter((id) => !existingVendorIds.has(id));

  if (newVendorIds.length > 0) {
    await prisma.bidInvitation.createMany({
      data: newVendorIds.map((vendorId) => ({
        purchaseRequestId: data.purchaseRequestId,
        vendorId,
        token:    randomUUID(),
        deadline,
        status:   'PENDING',
      })),
    });

    // Move PR to BIDDING
    await prisma.purchaseRequest.update({
      where: { id: data.purchaseRequestId },
      data:  { status: 'BIDDING' },
    });
  }

  const invitations = await prisma.bidInvitation.findMany({
    where: { purchaseRequestId: data.purchaseRequestId },
    include: {
      vendor: { select: { name: true, code: true, email: true } },
      bid:    true,
    },
  });

  return NextResponse.json(invitations, { status: 201 });
}
