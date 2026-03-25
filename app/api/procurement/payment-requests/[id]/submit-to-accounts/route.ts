import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/procurement/payment-requests/[id]/submit-to-accounts
// PM submits to Accounts (status: SUBMITTED → UNDER_REVIEW)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const pr = await prisma.paymentRequest.findUnique({ where: { id } });
  if (!pr) return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
  if (pr.status !== 'SUBMITTED') {
    return NextResponse.json({ error: `Cannot submit: current status is ${pr.status}` }, { status: 400 });
  }

  const updated = await prisma.paymentRequest.update({
    where: { id },
    data: { status: 'UNDER_REVIEW' },
  });

  return NextResponse.json(updated);
}
