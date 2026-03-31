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

// POST /api/procurement/purchase-orders — create manual PO (no RFQ)
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { vendorId, items, expectedDelivery, notes, currency } = body as {
    vendorId: string;
    items: Array<{ rawMaterialId?: string; itemDescription?: string; itemUnit?: string; quantity: number; unitPrice: number }>;
    expectedDelivery?: string;
    notes?: string;
    currency?: string;
  };

  if (!vendorId) return NextResponse.json({ error: 'Vendor required' }, { status: 400 });
  if (!items || items.length === 0) return NextResponse.json({ error: 'At least one item required' }, { status: 400 });

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
  if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });

  const { generatePONumber } = await import('@/lib/procurement-numbers');
  const poNumber = await generatePONumber();
  const totalAmount = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      vendorId,
      status: 'DRAFT',
      totalAmount,
      currency: currency ?? 'INR',
      expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : null,
      notes: notes ?? null,
      createdById: session.id,
      items: {
        create: items.map(i => ({
          rawMaterialId: i.rawMaterialId ?? null,
          itemDescription: i.itemDescription ?? null,
          itemUnit: i.itemUnit ?? null,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          receivedQuantity: 0,
        })),
      },
    },
    include: {
      vendor: { select: { name: true, code: true } },
      items: true,
    },
  });

  return NextResponse.json(po, { status: 201 });
}
