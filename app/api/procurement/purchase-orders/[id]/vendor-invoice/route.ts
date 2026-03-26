import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/procurement/purchase-orders/[id]/vendor-invoice
// PM uploads the physical invoice received from vendor
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: poId } = await params;
  const body = await req.json() as {
    invoiceNumber: string;
    amount: number;
    gstAmount?: number;
    tdsAmount?: number;
    fileUrl?: string;
    notes?: string;
  };

  const { invoiceNumber, amount, gstAmount = 0, tdsAmount = 0, fileUrl, notes } = body;

  if (!invoiceNumber || !amount) {
    return NextResponse.json({ error: 'invoiceNumber and amount are required' }, { status: 400 });
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    select: { id: true, vendorId: true, status: true },
  });
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });

  // Check no duplicate invoice number
  const existing = await prisma.vendorInvoice.findFirst({ where: { invoiceNumber } });
  if (existing) return NextResponse.json({ error: 'Invoice number already exists' }, { status: 409 });

  const netAmount = amount + gstAmount - tdsAmount;

  const invoice = await prisma.vendorInvoice.create({
    data: {
      invoiceNumber,
      poId,
      vendorId: po.vendorId,
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
