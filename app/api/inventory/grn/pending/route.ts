import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/inventory/grn/pending — pending GANs awaiting GRN creation
export async function GET() {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Find all GANs with status CREATED (no GRN yet)
  const pendingGANs = await prisma.goodsArrivalNote.findMany({
    where: { status: 'CREATED' },
    include: {
      po: {
        select: {
          id: true,
          poNumber: true,
          status: true,
          vendor: { select: { id: true, name: true, code: true } },
          items: {
            select: {
              id: true,
              rawMaterialId: true,
              quantity: true,
              unitPrice: true,
              receivedQuantity: true,
              rawMaterial: { select: { id: true, name: true, unit: true, code: true } },
              itemDescription: true,
              itemUnit: true,
            },
          },
        },
      },
      items: {
        select: {
          id: true,
          poItemId: true,
          materialId: true,
          qtyArrived: true,
          material: { select: { id: true, name: true, unit: true } },
        },
      },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(pendingGANs);
}
