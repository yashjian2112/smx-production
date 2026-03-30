import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'];

// GET /api/procurement/purchase-orders/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    if (!ALLOWED_ROLES.includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { id: params.id },
      include: {
        vendor: { select: { id: true, name: true, code: true } },
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        items: {
          include: { rawMaterial: { select: { name: true, unit: true } } },
        },
        goodsArrivals: {
          include: { items: true, grn: { select: { id: true, grnNumber: true } } },
        },
        rfq: { select: { rfqNumber: true, title: true, paymentTerms: true } },
        vendorInvoices: {
          select: { id: true, invoiceNumber: true, amount: true, gstAmount: true, tdsAmount: true, netAmount: true, status: true },
        },
        paymentRequest: { select: { id: true, requestNumber: true, status: true } },
      },
    });

    if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json(po);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
