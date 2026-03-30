import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const VIEW_ROLES = ['ADMIN', 'PURCHASE_MANAGER'] as const;

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!VIEW_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const grn = await prisma.goodsReceipt.findUnique({
    where:   { id: params.id },
    include: {
      receivedBy:    { select: { name: true, email: true } },
      purchaseOrder: {
        include: {
          vendor:          { select: { name: true, code: true, phone: true, email: true } },
          purchaseRequest: { select: { requestNumber: true, urgency: true } },
          items: {
            include: { rawMaterial: { select: { name: true, unit: true, code: true } } },
          },
        },
      },
      items: {
        include: {
          rawMaterial: { select: { id: true, name: true, unit: true, code: true, currentStock: true } },
          poItem:      { select: { quantity: true, receivedQuantity: true, unitPrice: true } },
        },
      },
      batches: {
        orderBy: { createdAt: 'asc' },
        include: { rawMaterial: { select: { name: true, unit: true, code: true } } },
      },
    },
  });

  if (!grn) return NextResponse.json({ error: 'GRN not found' }, { status: 404 });

  return NextResponse.json(grn);
}
