import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/inventory/job-cards/[id]/dispatch
// Server-driven: reads scanned serials from DB (linked via jobCardItemId during scanning).
// No body needed — all scan data is already persisted.
// Rules:
//   - Critical items: scanned qty must >= quantityReq (no shortfall allowed)
//   - Non-critical items: any qty ok (partial dispatch)
//   - If all items fully issued → dispatchType = FULL
//   - If some non-critical short → dispatchType = PARTIAL

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!['INVENTORY_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const jobCard = await prisma.jobCard.findUnique({
    where: { id },
    include: {
      order: { select: { id: true, productId: true } },
      items: {
        include: {
          rawMaterial: { select: { id: true, name: true, currentStock: true } },
          consumedSerials: {
            where: { status: { not: 'CONSUMED' } },
            select: { id: true, quantity: true, barcode: true },
          },
        }
      }
    }
  });

  if (!jobCard) return NextResponse.json({ error: 'Job card not found' }, { status: 404 });
  if (jobCard.status !== 'PENDING') {
    return NextResponse.json({ error: 'Job card is not in PENDING status' }, { status: 400 });
  }

  // Build issued map from DB (sum of serial quantities per item)
  const issuedMap = new Map<string, number>();
  const serialIdsByItem = new Map<string, string[]>();
  for (const item of jobCard.items) {
    const qty = item.consumedSerials.reduce((sum, s) => sum + s.quantity, 0);
    issuedMap.set(item.id, qty);
    serialIdsByItem.set(item.id, item.consumedSerials.map(s => s.id));
  }

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
      let primaryBatchId: string | null = null;
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

      if (primaryBatchId) {
        await tx.jobCardItem.update({
          where: { id: item.id },
          data: { batchId: primaryBatchId },
        });
      }

      await tx.rawMaterial.update({
        where: { id: item.rawMaterialId },
        data: { currentStock: { decrement: issued } },
      });

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

      await tx.jobCardItem.update({
        where: { id: item.id },
        data: { quantityIssued: issued },
      });

      // Mark serials as CONSUMED (jobCardItemId already set during scanning)
      const sIds = serialIdsByItem.get(item.id) ?? [];
      if (sIds.length > 0) {
        await tx.materialSerial.updateMany({
          where: { id: { in: sIds } },
          data: { status: 'CONSUMED' },
        });
      }

      // ── Board assignment: if this BOM item isBoard, assign serial barcodes to units ──
      const bomItem = await tx.bOMItem.findFirst({
        where: {
          productId: jobCard.order.productId,
          rawMaterialId: item.rawMaterialId,
          stage: jobCard.stage,
          isBoard: true,
        },
      });

      if (bomItem && sIds.length > 0) {
        // Get the scanned serial barcodes (ordered by scan time)
        const boardSerials = await tx.materialSerial.findMany({
          where: { id: { in: sIds } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, barcode: true },
        });

        // Determine which unit field to set based on stage
        const barcodeField = jobCard.stage === 'POWERSTAGE_MANUFACTURING'
          ? 'powerstageBarcode'
          : jobCard.stage === 'BRAINBOARD_MANUFACTURING'
            ? 'brainboardBarcode'
            : null;

        if (barcodeField) {
          // Get unassigned units for this order (barcode is null for this stage)
          const unassignedUnits = await tx.controllerUnit.findMany({
            where: {
              orderId: jobCard.orderId,
              [barcodeField]: null,
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          });

          // Assign board serials to units sequentially
          const assignCount = Math.min(boardSerials.length, unassignedUnits.length);
          for (let bi = 0; bi < assignCount; bi++) {
            await tx.controllerUnit.update({
              where: { id: unassignedUnits[bi].id },
              data: { [barcodeField]: boardSerials[bi].barcode },
            });
            // Link serial to the specific unit via allocatedToUnitId
            await tx.materialSerial.update({
              where: { id: boardSerials[bi].id },
              data: { allocatedToUnitId: unassignedUnits[bi].id },
            });
          }
        }
      }
    }

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
