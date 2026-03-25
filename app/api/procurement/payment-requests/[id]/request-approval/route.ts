import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/procurement/payment-requests/[id]/request-approval
// Accounts sends to Admin for approval (status: UNDER_REVIEW → PENDING_APPROVAL)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!['ADMIN', 'ACCOUNTS'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { accountsNote } = body as { accountsNote?: string };

  const pr = await prisma.paymentRequest.findUnique({ where: { id } });
  if (!pr) return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
  if (pr.status !== 'UNDER_REVIEW') {
    return NextResponse.json({ error: `Cannot request approval: current status is ${pr.status}` }, { status: 400 });
  }

  const updated = await prisma.paymentRequest.update({
    where: { id },
    data: {
      status: 'PENDING_APPROVAL',
      accountsNote: accountsNote ?? null,
      accountsById: session.id,
      accountsAt: new Date(),
    },
  });

  // Notify all ADMIN users
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', active: true }, select: { id: true } });
  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map(admin => ({
        userId: admin.id,
        type: 'PAYMENT_APPROVAL_REQUIRED',
        title: 'Payment Approval Required',
        message: `Payment request ${pr.requestNumber} requires your approval. ${accountsNote ? `Note: ${accountsNote}` : ''}`,
        relatedModel: 'payment_request',
        relatedId: id,
      })),
    });
  }

  return NextResponse.json(updated);
}
