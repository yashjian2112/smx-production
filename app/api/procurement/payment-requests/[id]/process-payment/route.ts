import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/procurement/payment-requests/[id]/process-payment
// Accounts records payment (status: APPROVED → PAID)
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
  const { paymentAmount, paymentMode, paymentRef, paymentDate } = body as {
    paymentAmount: number;
    paymentMode: string;
    paymentRef?: string;
    paymentDate: string;
  };

  if (!paymentAmount || !paymentMode || !paymentDate) {
    return NextResponse.json({ error: 'paymentAmount, paymentMode and paymentDate are required' }, { status: 400 });
  }

  const pr = await prisma.paymentRequest.findUnique({
    where: { id },
    include: {
      po: { select: { id: true, totalAmount: true, paidAmount: true } },
      vendorInvoice: { select: { id: true, netAmount: true } },
    },
  });
  if (!pr) return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
  if (pr.status !== 'APPROVED') {
    return NextResponse.json({ error: `Cannot process payment: current status is ${pr.status}` }, { status: 400 });
  }

  // Determine new PO payment status
  const newPaidAmount = (pr.po.paidAmount ?? 0) + paymentAmount;
  const poPaymentStatus = newPaidAmount >= pr.po.totalAmount ? 'PAID' : 'PARTIAL';

  await prisma.$transaction([
    prisma.paymentRequest.update({
      where: { id },
      data: {
        status: 'PAID',
        paymentAmount,
        paymentMode,
        paymentRef: paymentRef ?? null,
        paymentDate: new Date(paymentDate),
        paymentById: session.id,
      },
    }),
    prisma.purchaseOrder.update({
      where: { id: pr.poId },
      data: {
        paidAmount: newPaidAmount,
        paymentStatus: poPaymentStatus,
      },
    }),
    prisma.vendorInvoice.update({
      where: { id: pr.vendorInvoiceId },
      data: { status: 'PAID' },
    }),
  ]);

  const updated = await prisma.paymentRequest.findUnique({ where: { id } });
  return NextResponse.json(updated);
}
