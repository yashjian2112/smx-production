import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST — Accounts records a payment (ADVANCE, FINAL, or PARTIAL)
// Supports multiple payments per request (advance + balance)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'ACCOUNTS'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { type, amount, paymentMode, paymentRef, paymentDate, notes } = await req.json() as {
    type: 'ADVANCE' | 'FINAL' | 'PARTIAL';
    amount: number;
    paymentMode: string;
    paymentRef: string;
    paymentDate: string;
    notes?: string;
  };

  if (!type || !amount || !paymentMode || !paymentRef || !paymentDate) {
    return NextResponse.json({ error: 'type, amount, paymentMode, paymentRef, paymentDate required' }, { status: 400 });
  }

  const pr = await prisma.paymentRequest.findUnique({
    where: { id },
    include: { po: true, vendorPayments: true },
  });
  if (!pr) return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
  if (!['APPROVED', 'PROCESSING'].includes(pr.status)) {
    return NextResponse.json({ error: `Cannot record payment for request in status ${pr.status}` }, { status: 400 });
  }

  // Calculate how much has already been paid
  const alreadyPaid = pr.vendorPayments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
  const poTotal = pr.po.totalAmount;
  if (alreadyPaid + amount > poTotal) {
    return NextResponse.json({
      error: `Payment of ${amount} exceeds remaining balance ${(poTotal - alreadyPaid).toFixed(2)}`
    }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.vendorPayment.create({
      data: {
        paymentRequestId: id,
        type,
        amount,
        paymentMode,
        paymentRef,
        paymentDate: new Date(paymentDate),
        notes: notes ?? null,
        processedById: session.id,
      },
    });

    const newTotal = alreadyPaid + amount;
    const isFullyPaid = newTotal >= poTotal;

    // Update PO paidAmount + paymentStatus
    await tx.purchaseOrder.update({
      where: { id: pr.poId },
      data: {
        paidAmount: newTotal,
        paymentStatus: isFullyPaid ? 'PAID' : 'PARTIAL',
      },
    });

    // Update payment request status
    await tx.paymentRequest.update({
      where: { id },
      data: {
        status: isFullyPaid ? 'PAID' : 'PROCESSING',
        // Store last payment details for quick lookup
        paymentAmount: newTotal,
        paymentMode,
        paymentRef,
        paymentDate: new Date(paymentDate),
        paymentById: session.id,
      },
    });

    // If fully paid, mark vendor invoice as PAID
    if (isFullyPaid) {
      await tx.vendorInvoice.update({
        where: { id: pr.vendorInvoiceId },
        data: { status: 'PAID' },
      });
    }

    return payment;
  });

  return NextResponse.json(result, { status: 201 });
}

// GET — list all payments for a payment request
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'ACCOUNTS', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const payments = await prisma.vendorPayment.findMany({
    where: { paymentRequestId: id },
    include: { processedBy: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(payments);
}
