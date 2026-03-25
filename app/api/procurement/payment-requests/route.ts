import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generatePaymentRequestNumber } from '@/lib/procurement-numbers';

// GET /api/procurement/payment-requests — list all payment requests
export async function GET() {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER', 'ACCOUNTS'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const requests = await prisma.paymentRequest.findMany({
    include: {
      po: {
        select: {
          poNumber: true,
          totalAmount: true,
          currency: true,
          paidAmount: true,
          paymentStatus: true,
          vendor: { select: { id: true, name: true, code: true } },
          rfq: { select: { rfqNumber: true, paymentTerms: true } },
        },
      },
      vendorInvoice: {
        select: {
          invoiceNumber: true,
          amount: true,
          gstAmount: true,
          tdsAmount: true,
          netAmount: true,
          status: true,
          fileUrl: true,
        },
      },
      requestedBy: { select: { id: true, name: true } },
      accountsBy: { select: { id: true, name: true } },
      adminApprovedBy: { select: { id: true, name: true } },
      paymentBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(requests);
}

// POST /api/procurement/payment-requests — PM creates payment request
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { poId, vendorInvoiceId, notes } = body as {
    poId: string;
    vendorInvoiceId: string;
    notes?: string;
  };

  if (!poId || !vendorInvoiceId) {
    return NextResponse.json({ error: 'poId and vendorInvoiceId are required' }, { status: 400 });
  }

  // Check PO exists and has a GRN done
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: {
      id: true,
      vendorId: true,
      status: true,
      rfqId: true,
      paymentRequest: { select: { id: true } },
    },
  });
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });
  if (!['RECEIVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    return NextResponse.json({ error: 'Payment request can only be created after GRN is done' }, { status: 400 });
  }
  if (po.paymentRequest) {
    return NextResponse.json({ error: 'A payment request already exists for this PO' }, { status: 409 });
  }

  // Verify invoice belongs to this PO
  const invoice = await prisma.vendorInvoice.findUnique({
    where: { id: vendorInvoiceId },
    select: { id: true, poId: true, vendorId: true, status: true },
  });
  if (!invoice) return NextResponse.json({ error: 'Vendor invoice not found' }, { status: 404 });
  if (invoice.poId !== poId) return NextResponse.json({ error: 'Invoice does not belong to this PO' }, { status: 400 });

  // AI verification: check if PO vendor matches the best-scored (lowest price) vendor from RFQ quotes
  let aiVerified = false;
  let aiVerificationNote = 'No RFQ linked — manual verification required';

  if (po.rfqId) {
    const quotes = await prisma.vendorQuote.findMany({
      where: { rfqId: po.rfqId },
      select: { vendorId: true, totalAmount: true, status: true },
      orderBy: { totalAmount: 'asc' },
    });

    const selectedQuote = quotes.find(q => q.status === 'SELECTED');
    const lowestQuote = quotes[0];

    if (selectedQuote) {
      if (selectedQuote.vendorId === po.vendorId) {
        aiVerified = true;
        aiVerificationNote = 'AI verified: PO vendor matches the selected quote vendor from RFQ';
      } else {
        aiVerified = false;
        aiVerificationNote = 'Warning: PO vendor does not match the selected quote vendor from RFQ. Manual review required.';
      }
    } else if (lowestQuote) {
      if (lowestQuote.vendorId === po.vendorId) {
        aiVerified = true;
        aiVerificationNote = 'AI verified: PO vendor matches the lowest-priced vendor from RFQ';
      } else {
        aiVerified = false;
        aiVerificationNote = 'Warning: PO vendor is not the lowest-priced vendor from RFQ. Manual review required.';
      }
    }
  }

  const requestNumber = await generatePaymentRequestNumber();

  const paymentRequest = await prisma.paymentRequest.create({
    data: {
      requestNumber,
      poId,
      vendorInvoiceId,
      requestedById: session.id,
      status: 'SUBMITTED',
      aiVerified,
      aiVerificationNote,
      notes: notes ?? null,
    },
    include: {
      po: { select: { poNumber: true, vendor: { select: { name: true } } } },
      vendorInvoice: { select: { invoiceNumber: true, netAmount: true } },
      requestedBy: { select: { name: true } },
    },
  });

  return NextResponse.json(paymentRequest, { status: 201 });
}
