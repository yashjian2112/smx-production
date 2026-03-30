import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['INVENTORY_MANAGER', 'PRODUCTION_EMPLOYEE', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const jobCard = await prisma.jobCard.findUnique({
    where: { id },
    include: { items: { include: { rawMaterial: true } } }
  });
  if (!jobCard) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (jobCard.status !== 'PENDING') return NextResponse.json({ error: 'Already issued' }, { status: 400 });

  // FIFO: for each item, deduct from oldest batch
  for (const item of jobCard.items) {
    const batches = await prisma.inventoryBatch.findMany({
      where: { rawMaterialId: item.rawMaterialId, remainingQty: { gt: 0 } },
      orderBy: { createdAt: 'asc' }, // FIFO - oldest first
    });

    let remaining = item.quantityReq;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const deduct = Math.min(batch.remainingQty, remaining);
      await prisma.inventoryBatch.update({
        where: { id: batch.id },
        data: { remainingQty: { decrement: deduct } }
      });
      // Update job card item with batch used
      await prisma.jobCardItem.update({
        where: { id: item.id },
        data: { batchId: batch.id, quantityIssued: { increment: deduct } }
      });
      remaining -= deduct;
    }

    // Deduct from material currentStock
    await prisma.rawMaterial.update({
      where: { id: item.rawMaterialId },
      data: { currentStock: { decrement: item.quantityReq } }
    });

    // Log stock movement
    await prisma.stockMovement.create({
      data: {
        rawMaterialId: item.rawMaterialId,
        type: 'OUT',
        quantity: item.quantityReq,
        reference: jobCard.cardNumber,
        notes: `Job Card ${jobCard.cardNumber} - Stage: ${jobCard.stage}`,
        createdById: session.id,
      }
    });
  }

  // Mark job card as dispatched
  const updated = await prisma.jobCard.update({
    where: { id },
    data: { status: 'DISPATCHED', dispatchedById: session.id, dispatchedAt: new Date() },
    include: {
      items: { include: { rawMaterial: { select: { name: true, code: true, unit: true } }, batch: { select: { batchCode: true } } } },
      order: { select: { orderNumber: true } },
      unit: { select: { serialNumber: true } },
    }
  });

  return NextResponse.json(updated);
}
