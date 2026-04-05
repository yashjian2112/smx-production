import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/inventory/job-cards/[id]/dispatch
// Body: { items: [{ jobCardItemId: string, issuedQty: number, serialIds?: string[] }] }
// IM scans each item's unique MaterialSerial barcodes.
// serialIds are the MaterialSerial IDs to mark as CONSUMED.
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
  if (!['INVENTORY_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { items }: { items: { jobCardItemId: string; issuedQty: number; serialIds?: string[] }[] } = body;

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

  // Build a map — record actual qty issued (reels can exceed order qty, excess returned after use)
  const issuedMap = new Map(
    items.map(i => [i.jobCardItemId, Math.max(0, i.issuedQty)])
  );

  // Validate stock availability (prevent negative stock)
  const stockErrors: string[] = [];
  for (const item of jobCard.items) {
    const issued = issuedMap.get(item.id) ?? 0;
    if (issued > 0 && issued > item.rawMaterial.currentStock) {
      stockErrors.push(`"${item.rawMaterial.name}": need ${issued}, only ${item.rawMaterial.currentStock} in stock`);
    }
  }
  if (stockErrors.length > 0) {
    return NextResponse.json({ error: 'Insufficient stock for some items', stockErrors }, { status: 422 });
  }

  // Validate critical items — must be fully scanned
  const criticalErrors: string[] = [];
  for (const item of jobCard.items) {
    if (!item.isCritical) continue;
    const issued = issuedMap.get(item.id) ?? 0;
    if (issued < item.quantityReq) {
      criticalErrors.push(`"${item.rawMaterial.name}" is CRITICAL — need ${item.quantityReq}, scanned ${issued}`);
    }
  }
  if (criticalErrors.length > 0) {
    return NextResponse.json({ error: 'Cannot dispatch: critical items not fully scanned', criticalErrors }, { status: 422 });
  }

  // Must scan at least one item
  const totalIssued = Array.from(issuedMap.values()).reduce((a, b) => a + b, 0);
  if (totalIssued === 0) {
    return NextResponse.json({ error: 'Scan at least one item before dispatching' }, { status: 400 });
  }

  // Determine dispatch type
  const allFull = jobCard.items.every(item => (issuedMap.get(item.id) ?? 0) >= item.quantityReq);
  const dispatchType = allFull ? 'FULL' : 'PARTIAL';

  // Deduct stock (FIFO) and update job card items
  try {
  await prisma.$transaction(async (tx) => {
    for (const item of jobCard.items) {
      const issued = issuedMap.get(item.id) ?? 0;
      if (issued <= 0) continue;

      // Re-check stock inside transaction to prevent race condition
      const freshMaterial = await tx.rawMaterial.findUnique({
        where: { id: item.rawMaterialId },
        select: { currentStock: true, name: true },
      });
      if (!freshMaterial || issued > freshMaterial.currentStock) {
        throw new Error(`Insufficient stock for "${freshMaterial?.name ?? item.rawMaterialId}": need ${issued}, only ${freshMaterial?.currentStock ?? 0} available`);
      }

      // FIFO: deduct from oldest batches first
      let remaining = issued;
      let primaryBatchId: string | null = null;  // track first batch used
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
        if (!primaryBatchId && deduct > 0) primaryBatchId = batch.id;
        remaining -= deduct;
      }

      // Save which batch this item came from (for component tracing)
      if (primaryBatchId) {
        await tx.jobCardItem.update({
          where: { id: item.id },
          data: { batchId: primaryBatchId },
        });
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

      // Mark MaterialSerials as CONSUMED and link to job card item
      const itemPayload = items.find(i => i.jobCardItemId === item.id);
      if (itemPayload?.serialIds?.length) {
        await tx.materialSerial.updateMany({
          where: { id: { in: itemPayload.serialIds } },
          data: { status: 'CONSUMED', jobCardItemId: item.id },
        });
      }
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
  } catch (txError) {
    const message = txError instanceof Error ? txError.message : 'Transaction failed';
    return NextResponse.json({ error: message }, { status: 422 });
  }

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

  // Auto-create RO for any items where stock dropped below reorder point
  try {
    const { autoCreateRO } = await import('@/lib/requirement-order');
    const lowItems: { materialId: string; qtyRequired: number; notes: string }[] = [];
    for (const item of jobCard.items) {
      const issued = issuedMap.get(item.id) ?? 0;
      if (issued <= 0) continue;
      const mat = await prisma.rawMaterial.findUnique({
        where: { id: item.rawMaterialId },
        select: { currentStock: true, reorderPoint: true, minimumOrderQty: true },
      });
      if (mat && mat.currentStock <= mat.reorderPoint && mat.minimumOrderQty > 0) {
        lowItems.push({
          materialId: item.rawMaterialId,
          qtyRequired: mat.minimumOrderQty,
          notes: `Auto: dispatched for job card ${jobCard.cardNumber}, stock now ${mat.currentStock}`,
        });
      }
    }
    if (lowItems.length > 0) {
      await autoCreateRO({ trigger: 'JOB_CARD', items: lowItems, jobCardId: id });
    }
  } catch (roError) {
    console.error('[Auto-RO] Failed to create requirement order after dispatch:', roError);
  }

  return NextResponse.json(updated);
}
