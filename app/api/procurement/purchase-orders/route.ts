import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/procurement/purchase-orders — list POs
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const validPOStatuses = ['DRAFT', 'APPROVED', 'SENT', 'CONFIRMED', 'GOODS_ARRIVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'];
  if (status && !validPOStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const pos = await prisma.purchaseOrder.findMany({
    where: status ? { status: status as 'DRAFT' | 'APPROVED' | 'SENT' | 'CONFIRMED' | 'GOODS_ARRIVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED' } : undefined,
    include: {
      vendor: { select: { id: true, name: true, code: true } },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      items: {
        include: { rawMaterial: { select: { name: true, unit: true } } },
        // includes itemDescription + itemUnit for custom items
      },
      goodsArrivals: {
        include: { items: true, grn: { select: { id: true, grnNumber: true } } },
      },
      rfq: { select: { rfqNumber: true, title: true, paymentTerms: true } },
      vendorInvoices: { select: { id: true, invoiceNumber: true, amount: true, gstAmount: true, tdsAmount: true, netAmount: true, status: true } },
      paymentRequest: { select: { id: true, requestNumber: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(pos);
}
