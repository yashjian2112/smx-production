import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { itemId, verifiedQty } = await req.json();
  if (!itemId || verifiedQty === undefined || verifiedQty === null) {
    return NextResponse.json({ error: 'itemId and verifiedQty are required' }, { status: 400 });
  }

  const jobCard = await prisma.jobCard.findUnique({ where: { id } });
  if (!jobCard) return NextResponse.json({ error: 'Job card not found' }, { status: 404 });
  if (jobCard.status !== 'DISPATCHED') {
    return NextResponse.json({ error: 'Can only verify items on DISPATCHED job cards' }, { status: 400 });
  }

  await prisma.jobCardItem.update({
    where: { id: itemId },
    data: { verifiedQty: parseFloat(verifiedQty), isVerified: true },
  });

  const updated = await prisma.jobCard.findUnique({
    where: { id },
    include: {
      order: { select: { orderNumber: true } },
      unit: { select: { serialNumber: true } },
      createdBy: { select: { name: true } },
      dispatchedBy: { select: { name: true } },
      items: {
        include: {
          rawMaterial: {
            select: { id: true, name: true, code: true, unit: true, barcode: true, currentStock: true, purchaseUnit: true, conversionFactor: true }
          },
          batch: { select: { id: true, batchCode: true, remainingQty: true } },
        }
      }
    }
  });

  return NextResponse.json(updated);
}
