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

  const pos = await prisma.purchaseOrder.findMany({
    where: status ? { status: status as any } : undefined,
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
      rfq: { select: { rfqNumber: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(pos);
}
