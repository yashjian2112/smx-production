import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/procurement/payment-requests/[id]/approve
// Admin approves (status: PENDING_APPROVAL → APPROVED)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Only ADMIN can approve payment requests' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { adminNote } = body as { adminNote?: string };

  const pr = await prisma.paymentRequest.findUnique({ where: { id } });
  if (!pr) return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
  if (pr.status !== 'PENDING_APPROVAL') {
    return NextResponse.json({ error: `Cannot approve: current status is ${pr.status}` }, { status: 400 });
  }

  const updated = await prisma.paymentRequest.update({
    where: { id },
    data: {
      status: 'APPROVED',
      adminApprovedById: session.id,
      adminApprovedAt: new Date(),
      adminNote: adminNote ?? null,
    },
  });

  // Notify all ACCOUNTS users
  const accountsUsers = await prisma.user.findMany({ where: { role: 'ACCOUNTS', active: true }, select: { id: true } });
  if (accountsUsers.length > 0) {
    await prisma.notification.createMany({
      data: accountsUsers.map(u => ({
        userId: u.id,
        type: 'PAYMENT_APPROVED',
        title: 'Payment Request Approved',
        message: `Payment request ${pr.requestNumber} has been approved by Admin. You can now process the payment.`,
        relatedModel: 'payment_request',
        relatedId: id,
      })),
    });
  }

  return NextResponse.json(updated);
}
