import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/inventory/job-cards/[id]/dispatch
// Body: { items: [{ jobCardItemId: string, issuedQty: number }] }
// IM scans each item and sets the issued qty.
// Rules:
//   - Critical items: issuedQty must == quantityReq (no shortfall allowed)
//   - Non-critical items: any qty ok (partial dispatch)
//   - If all items fully issued → dispatchType = FULL
//   - If some non-critical short → dispatchType = PARTIAL

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!['INVENTORY_MANAGER', 'STORE_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { items }: { items: { jobCardItemId: string; issuedQty: number }[] } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items array required' }, { status: 400 });
  }

  const jobCard = await prisma.jobCard.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          rawMaterial: { select: { id: true, name: true, currentStock: true } }
        }
      }
    }
  });

  if (!jobCard) return NextResponse.json({ error: 'Job card not found' }, { status: 404 });
  if (jobCard.status !== 'PENDING') {
    return NextResponse.json({ error: 'Job card is not in PENDING status' }, { status: 400 });
  }

  // Build a map of issued qtys
  const issuedMap = new Map(items.map(i => [i.jobCardItemId, i.issuedQty]));

  // Validate critical items
  const criticalErrors: string[] = [];
  for (const item of jobCard.items) {
    if (!item.isCritical) continue;
    const issued = issuedMap.get(item.id) ?? 0;
    if (issued < item.quantityReq) {
      criticalErrors.push(
        `"${item.rawMaterial.name}" is critical — need ${item.quantityReq}, only ${issued} available`
      );
    }
  }

  if (criticalErrors.length > 0) {
    return NextResponse.json({
      error: 'Cannot dispatch: critical items have insufficient stock',
      criticalErrors,
    }, { status: 422 });
  }

  // Determine dispatch type
  const allFull = jobCard.items.every(item => {
    const issued = issuedMap.get(item.id) ?? 0;
    return issued >= item.quantityReq;
  });
  const dispatchType = allFull ? 'FULL' : 'PARTIAL';

  // Deduct stock (FIFO) and update job card items
  await prisma.$transaction(async (tx) => {
    for (const item of jobCard.items) {
      const issued = issuedMap.get(item.id) ?? 0;
      if (issued <= 0) continue;

      // FIFO: deduct from oldest batches first
      let remaining = issued;
      const batches = await tx.inventoryBatch.findMany({
        where: { rawMaterialId: item.rawMaterialId, remainingQty: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      });

      for (const batch of batches) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, batch.remainingQty);
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: { remainingQty: { decrement: deduct } },
        });
        remaining -= deduct;
      }

      // Update material currentStock
      await tx.rawMaterial.update({
        where: { id: item.rawMaterialId },
        data: { currentStock: { decrement: issued } },
      });

      // Log stock movement
      await tx.stockMovement.create({
        data: {
          rawMaterialId: item.rawMaterialId,
          type: 'OUT',
          quantity: issued,
          reference: jobCard.cardNumber,
          notes: `Dispatched for job card ${jobCard.cardNumber} (${dispatchType})`,
          createdById: session.id,
        }
      });

      // Update job card item
      await tx.jobCardItem.update({
        where: { id: item.id },
        data: { quantityIssued: issued },
      });
    }

    // Update job card status
    await tx.jobCard.update({
      where: { id },
      data: {
        status: 'DISPATCHED',
        dispatchType: dispatchType as 'FULL' | 'PARTIAL',
        dispatchedById: session.id,
        dispatchedAt: new Date(),
      },
    });
  });

  const updated = await prisma.jobCard.findUnique({
    where: { id },
    include: {
      order: { select: { orderNumber: true } },
      dispatchedBy: { select: { name: true } },
      items: {
        include: {
          rawMaterial: { select: { id: true, name: true, code: true, unit: true, barcode: true } }
        }
      }
    }
  });

  return NextResponse.json(updated);
}
