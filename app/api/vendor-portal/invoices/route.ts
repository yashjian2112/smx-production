import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Auth helper: vendor session or token query param
async function getVendorFromRequest(req: NextRequest): Promise<{ id: string; name: string } | null> {
  const token = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-vendor-token');
  if (!token) return null;
  // Find an RFQ invite token to identify the vendor
  const invite = await prisma.rFQVendorInvite.findUnique({
    where: { token },
    select: { vendor: { select: { id: true, name: true } } },
  });
  return invite?.vendor ?? null;
}

// POST /api/vendor-portal/invoices — vendor submits invoice
export async function POST(req: NextRequest) {
  const vendor = await getVendorFromRequest(req);
  if (!vendor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { poId, invoiceNumber, amount, gstAmount = 0, tdsAmount = 0, fileUrl, notes } = body as {
    poId: string;
    invoiceNumber: string;
    amount: number;
    gstAmount?: number;
    tdsAmount?: number;
    fileUrl?: string;
    notes?: string;
  };

  if (!poId || !invoiceNumber || !amount) {
    return NextResponse.json({ error: 'poId, invoiceNumber and amount are required' }, { status: 400 });
  }

  // Verify vendor owns this PO (they were selected via VendorQuote or PO.vendorId)
  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: { id: true, vendorId: true, status: true },
  });
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });
  if (po.vendorId !== vendor.id) return NextResponse.json({ error: 'You are not the vendor for this PO' }, { status: 403 });
  if (!['RECEIVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
    return NextResponse.json({ error: 'Invoice can only be submitted after goods have been received (GRN done)' }, { status: 400 });
  }

  // Prevent duplicate invoice numbers across all POs for this vendor
  const existing = await prisma.vendorInvoice.findFirst({
    where: { invoiceNumber, vendorId: vendor.id },
  });
  if (existing) return NextResponse.json({ error: 'An invoice with this number has already been submitted' }, { status: 409 });

  const netAmount = amount + gstAmount - tdsAmount;

  const invoice = await prisma.vendorInvoice.create({
    data: {
      invoiceNumber,
      poId,
      vendorId: vendor.id,
      amount,
      gstAmount,
      tdsAmount,
      netAmount,
      fileUrl: fileUrl ?? null,
      notes: notes ?? null,
      status: 'PENDING',
    },
  });

  return NextResponse.json(invoice, { status: 201 });
}

// GET /api/vendor-portal/invoices — vendor sees their invoices
export async function GET(req: NextRequest) {
  const vendor = await getVendorFromRequest(req);
  if (!vendor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const invoices = await prisma.vendorInvoice.findMany({
    where: { vendorId: vendor.id },
    include: {
      po: { select: { poNumber: true, totalAmount: true, status: true, paymentStatus: true } },
      paymentRequest: { select: { id: true, requestNumber: true, status: true } },
    },
    orderBy: { submittedAt: 'desc' },
  });

  return NextResponse.json(invoices);
}
