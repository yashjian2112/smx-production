import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/vendor-portal/my-pos?token=<rfq_invite_token>
// Returns all POs assigned to this vendor (identified via their RFQ invite token)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 401 });

  const invite = await prisma.rFQVendorInvite.findUnique({
    where: { token },
    select: { vendorId: true, vendor: { select: { id: true, name: true } } },
  });
  if (!invite) return NextResponse.json({ error: 'Invalid token' }, { status: 403 });

  const pos = await prisma.purchaseOrder.findMany({
    where: { vendorId: invite.vendorId },
    select: {
      id: true,
      poNumber: true,
      status: true,
      totalAmount: true,
      currency: true,
      paymentStatus: true,
      paidAmount: true,
      expectedDelivery: true,
      createdAt: true,
      rfq: { select: { rfqNumber: true, title: true, paymentTerms: true } },
      items: { select: { id: true, quantity: true, unitPrice: true, itemDescription: true, itemUnit: true, rawMaterial: { select: { name: true, unit: true } } } },
      vendorInvoices: {
        select: {
          id: true,
          invoiceNumber: true,
          amount: true,
          gstAmount: true,
          tdsAmount: true,
          netAmount: true,
          status: true,
          submittedAt: true,
        },
      },
      paymentRequest: { select: { id: true, requestNumber: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ vendorName: invite.vendor.name, pos });
}
