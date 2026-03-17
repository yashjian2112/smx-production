import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const VIEW_ROLES    = ['ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER'] as const;  // can GET
const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER'] as const;                   // can PATCH

const updateSchema = z.object({
  name:         z.string().min(1).optional(),
  unit:         z.string().min(1).optional(),
  categoryId:   z.string().nullable().optional(),
  minimumStock: z.number().min(0).optional(),
  reorderPoint: z.number().min(0).optional(),
  active:       z.boolean().optional(),
});

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!VIEW_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const material = await prisma.rawMaterial.findUnique({
    where:   { id: params.id },
    include: {
      category: true,
      batches: {
        where:   { remainingQty: { gt: 0 } },
        orderBy: { createdAt: 'asc' }, // FIFO: oldest first
        include: {
          goodsReceipt: {
            select: { grnNumber: true, receivedAt: true, purchaseOrder: { select: { poNumber: true, vendor: { select: { name: true } } } } },
          },
        },
      },
      stockMovements: {
        orderBy: { createdAt: 'desc' },
        take:    20,
        include: { createdBy: { select: { name: true } } },
      },
      purchaseRequests: {
        where:   { status: { notIn: ['RECEIVED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
        select:  { id: true, requestNumber: true, status: true, quantityRequired: true, unit: true },
      },
    },
  });

  if (!material) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    ...material,
    isLowStock: material.currentStock <= material.reorderPoint,
    isCritical: material.currentStock <= material.minimumStock,
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = updateSchema.parse(body);

  const material = await prisma.rawMaterial.update({
    where: { id: params.id },
    data,
    include: { category: { select: { id: true, name: true } } },
  });

  return NextResponse.json(material);
}
