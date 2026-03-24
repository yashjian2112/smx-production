import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateGRNNumber } from '@/lib/procurement-numbers';

// POST /api/procurement/purchase-orders/[id]/grn — IM creates GRN after verifying goods
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { ganId, notes, items } = body as {
    ganId: string;
    notes?: string;
    items: {
      ganItemId?: string;
      poItemId: string;
      materialId: string;
      qtyVerified: number;
      qtyRejected?: number;
      rejectionNote?: string;
      unitPrice?: number;
    }[];
  };

  if (!ganId) return NextResponse.json({ error: 'ganId required' }, { status: 400 });
  if (!items?.length) return NextResponse.json({ error: 'Items required' }, { status: 400 });

  const gan = await prisma.goodsArrivalNote.findUnique({
    where: { id: ganId },
    include: { po: { include: { items: true } }, grn: true },
  });
  if (!gan) return NextResponse.json({ error: 'GAN not found' }, { status: 404 });
  if (gan.grn) return NextResponse.json({ error: 'GRN already created for this GAN' }, { status: 400 });

  // Check for existing GRN on this PO (partial GRN allowed — just create another)
  const grnNumber = await generateGRNNumber();

  const grn = await prisma.$transaction(async (tx) => {
    // Create GRN
    const created = await tx.goodsReceipt.create({
      data: {
        grnNumber,
        purchaseOrderId: (await params).id,
        ganId,
        receivedById: session.id,
        notes: notes ?? null,
        items: {
          create: items.map(i => ({
            poItemId: i.poItemId,
            rawMaterialId: i.materialId,
            quantity: i.qtyVerified,
            unitPrice: i.unitPrice ?? 0,
            condition: (i.qtyRejected ?? 0) > 0 ? 'DAMAGED' : 'GOOD',
          })),
        },
      },
    });

    // Update stock for each verified item (FIFO batch creation)
    for (const item of items) {
      if (item.qtyVerified <= 0) continue;

      // Create batch
      const batchCount = await tx.inventoryBatch.count({ where: { rawMaterialId: item.materialId } });
      const batchCode = `BATCH/${String(batchCount + 1).padStart(4, '0')}/${item.materialId.slice(-6).toUpperCase()}`;

      await tx.inventoryBatch.create({
        data: {
          batchCode,
          rawMaterialId: item.materialId,
          goodsReceiptId: created.id,
          poItemId: item.poItemId,
          quantity: item.qtyVerified,
          remainingQty: item.qtyVerified,
          unitPrice: item.unitPrice ?? 0,
          condition: 'GOOD',
          notes: `GRN ${grnNumber}`,
        },
      });

      // Increment currentStock
      await tx.rawMaterial.update({
        where: { id: item.materialId },
        data: { currentStock: { increment: item.qtyVerified } },
      });

      // Stock movement log
      await tx.stockMovement.create({
        data: {
          rawMaterialId: item.materialId,
          type: 'IN',
          quantity: item.qtyVerified,
          reference: grnNumber,
          notes: `GRN from PO. GAN: ${gan.ganNumber}`,
          createdById: session.id,
        },
      });

      // Update PO item received qty
      await tx.pOItem.update({
        where: { id: item.poItemId },
        data: { receivedQuantity: { increment: item.qtyVerified } },
      });
    }

    // Mark GAN as done
    await tx.goodsArrivalNote.update({ where: { id: ganId }, data: { status: 'GRN_DONE' } });

    // Check if PO is fully received
    const poItems = await tx.pOItem.findMany({ where: { purchaseOrderId: (await params).id } });
    const allReceived = poItems.every((pi: { receivedQuantity: number; quantity: number }) => pi.receivedQuantity >= pi.quantity);
    await tx.purchaseOrder.update({
      where: { id: (await params).id },
      data: { status: allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
    });

    return created;
  });

  return NextResponse.json(grn, { status: 201 });
}
