import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateGANNumber } from '@/lib/procurement-numbers';

// POST /api/procurement/purchase-orders/[id]/gan — PM creates Goods Arrival Note
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { arrivalDate, notes, photoUrls, items } = body as {
    arrivalDate?: string;
    notes?: string;
    photoUrls?: string[];
    items: { poItemId: string; materialId: string; qtyArrived: number }[];
  };

  if (!items?.length) return NextResponse.json({ error: 'Items required' }, { status: 400 });

  const poId = (await params).id;
  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
  if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 });
  if (!['APPROVED', 'SENT', 'CONFIRMED'].includes(po.status)) {
    return NextResponse.json({ error: `Cannot create GAN for PO in status ${po.status}` }, { status: 400 });
  }

  const ganNumber = await generateGANNumber();

  let gan;
  try {
    gan = await prisma.$transaction(async (tx) => {
      // C5: Atomic status transition — prevents concurrent GAN creation
      const updated = await tx.purchaseOrder.updateMany({
        where: { id: poId, status: { in: ['APPROVED', 'SENT', 'CONFIRMED'] } },
        data: { status: 'GOODS_ARRIVED' },
      });
      if (updated.count === 0) {
        throw new Error('GAN already in progress for this PO');
      }

      const created = await tx.goodsArrivalNote.create({
        data: {
          ganNumber,
          poId,
          arrivalDate: arrivalDate ? new Date(arrivalDate) : new Date(),
          notes: notes ?? null,
          photoUrls: photoUrls ?? [],
          createdById: session.id,
          items: {
            create: items.map(i => ({
              poItemId: i.poItemId,
              materialId: i.materialId,
              qtyArrived: i.qtyArrived,
            })),
          },
        },
        include: { items: { include: { material: { select: { name: true, unit: true } } } } },
      });

      return created;
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create GAN';
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  return NextResponse.json(gan, { status: 201 });
}
