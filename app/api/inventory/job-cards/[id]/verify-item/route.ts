import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['PRODUCTION_EMPLOYEE', 'ADMIN', 'HARNESS_PRODUCTION'].includes(session.role)) {
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

  await prisma.$transaction(async (tx) => {
    await tx.jobCardItem.update({
      where: { id: itemId },
      data: { verifiedQty: parseFloat(verifiedQty), isVerified: true },
    });
    // Auto-transition to IN_PROGRESS when all items verified
    const allItems = await tx.jobCardItem.findMany({ where: { jobCardId: id } });
    const allVerified = allItems.every(i => i.id === itemId ? true : i.isVerified);
    if (allVerified) {
      await tx.jobCard.update({ where: { id }, data: { status: 'IN_PROGRESS' } });
    }
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
