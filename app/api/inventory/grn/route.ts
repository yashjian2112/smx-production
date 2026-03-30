import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextGRNNumber, generateNextBatchCode } from '@/lib/invoice-number';

const ALLOWED_ROLES  = ['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'] as const;
const VIEW_ROLES     = ['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'] as const;

const grnItemSchema = z.object({
  poItemId:         z.string(),
  rawMaterialId:    z.string(),
  quantity:         z.number().positive(),
  unitPrice:        z.number().min(0).default(0),
  condition:        z.enum(['GOOD', 'DAMAGED', 'REJECTED']).default('GOOD'),
  manufacturingDate:z.string().optional(),
  expiryDate:       z.string().optional(),
});

const createGRNSchema = z.object({
  purchaseOrderId: z.string(),
  notes:           z.string().optional(),
  items:           z.array(grnItemSchema).min(1),
});

export async function GET() {
  const session = await requireSession();
  if (!VIEW_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const receipts = await prisma.goodsReceipt.findMany({
    orderBy: { receivedAt: 'desc' },
    include: {
      receivedBy:    { select: { name: true } },
      purchaseOrder: {
        include: {
          vendor: { select: { name: true, code: true } },
          purchaseRequest: { select: { requestNumber: true } },
        },
      },
      items: {
        include: { rawMaterial: { select: { name: true, unit: true, code: true } } },
      },
      batches: {
        select: { id: true, batchCode: true, quantity: true, remainingQty: true, condition: true },
      },
    },
  });

  return NextResponse.json(receipts);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = createGRNSchema.parse(body);

  // Validate PO exists and is in a receivable state
  const po = await prisma.purchaseOrder.findUnique({
    where:   { id: data.purchaseOrderId },
    include: { items: true, purchaseRequest: true },
  });

  if (!po) return NextResponse.json({ error: 'Purchase Order not found' }, { status: 404 });
  if (['RECEIVED', 'CANCELLED'].includes(po.status)) {
    return NextResponse.json({ error: `PO is already ${po.status}` }, { status: 400 });
  }

  // Require GAN to be created before GRN
  if (po.status !== 'GOODS_ARRIVED' && po.status !== 'PARTIALLY_RECEIVED') {
    return NextResponse.json({
      error: 'Cannot create GRN: Goods Arrival Note must be created first by Purchase Manager before goods can be received.'
    }, { status: 400 });
  }

  // Generate GRN number (outside transaction to avoid long lock)
  const grnNumber = await generateNextGRNNumber();

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create GoodsReceipt
    const grn = await tx.goodsReceipt.create({
      data: {
        grnNumber,
        purchaseOrderId: data.purchaseOrderId,
        receivedById:    session.id,
        notes:           data.notes,
      },
    });

    const batchesCreated = [];

    for (const item of data.items) {
      // 2. Create GoodsReceiptItem
      await tx.goodsReceiptItem.create({
        data: {
          goodsReceiptId: grn.id,
          poItemId:       item.poItemId,
          rawMaterialId:  item.rawMaterialId,
          quantity:       item.quantity,
          unitPrice:      item.unitPrice,
          condition:      item.condition,
        },
      });

      // 3. Update POItem.receivedQuantity
      await tx.pOItem.update({
        where: { id: item.poItemId },
        data:  { receivedQuantity: { increment: item.quantity } },
      });

      // 4. For GOOD items only: create batch + update stock
      if (item.condition === 'GOOD') {
        const batchCode = await generateNextBatchCode();

        const batch = await tx.inventoryBatch.create({
          data: {
            batchCode,
            rawMaterialId:    item.rawMaterialId,
            goodsReceiptId:   grn.id,
            poItemId:         item.poItemId,
            quantity:         item.quantity,
            remainingQty:     item.quantity,
            unitPrice:        item.unitPrice,
            condition:        'GOOD',
            manufacturingDate: item.manufacturingDate ? new Date(item.manufacturingDate) : null,
            expiryDate:        item.expiryDate ? new Date(item.expiryDate) : null,
          },
        });
        batchesCreated.push(batch);

        // 5. Update RawMaterial.currentStock
        await tx.rawMaterial.update({
          where: { id: item.rawMaterialId },
          data:  { currentStock: { increment: item.quantity } },
        });

        // 6. Create StockMovement audit record
        await tx.stockMovement.create({
          data: {
            rawMaterialId: item.rawMaterialId,
            type:          'IN',
            quantity:      item.quantity,
            reference:     grnNumber,
            notes:         `GRN from PO ${po.poNumber} — ${item.condition}`,
            createdById:   session.id,
          },
        });
      }

      // 4b. For DAMAGED/REJECTED items: create batch for audit (no stock increment)
      if (item.condition === 'DAMAGED' || item.condition === 'REJECTED') {
        const batchCode = await generateNextBatchCode();
        await tx.inventoryBatch.create({
          data: {
            batchCode,
            rawMaterialId:    item.rawMaterialId,
            goodsReceiptId:   grn.id,
            poItemId:         item.poItemId,
            quantity:         item.quantity,
            remainingQty:     0,
            unitPrice:        item.unitPrice,
            condition:        item.condition as 'DAMAGED' | 'REJECTED',
            manufacturingDate: item.manufacturingDate ? new Date(item.manufacturingDate) : null,
            expiryDate:        item.expiryDate ? new Date(item.expiryDate) : null,
          },
        });
        await tx.stockMovement.create({
          data: {
            rawMaterialId: item.rawMaterialId,
            type:          'ADJUSTMENT',
            quantity:      item.quantity,
            reference:     grnNumber,
            adjustmentType: 'DAMAGE',
            notes:         `GRN damaged receipt from PO ${po.poNumber} — condition: ${item.condition}`,
            createdById:   session.id,
          },
        });
      }
    }

    // 7. Determine updated PO status based on received quantities
    const updatedItems = await tx.pOItem.findMany({ where: { purchaseOrderId: data.purchaseOrderId } });
    const allReceived  = updatedItems.every(i => i.receivedQuantity >= i.quantity);
    const anyReceived  = updatedItems.some(i => i.receivedQuantity > 0);

    const newPOStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : po.status;
    const newPRStatus = allReceived ? 'RECEIVED' : anyReceived ? 'PARTIALLY_RECEIVED' : null;

    await tx.purchaseOrder.update({
      where: { id: data.purchaseOrderId },
      data:  { status: newPOStatus as any },
    });

    if (newPRStatus) {
      await tx.purchaseRequest.update({
        where: { id: po.purchaseRequestId! },
        data:  { status: newPRStatus as any },
      });
    }

    // 8. Return the full GRN with batches
    return tx.goodsReceipt.findUnique({
      where:   { id: grn.id },
      include: {
        receivedBy:    { select: { name: true } },
        purchaseOrder: { include: { vendor: { select: { name: true, code: true } }, purchaseRequest: { select: { requestNumber: true } } } },
        items:         { include: { rawMaterial: { select: { name: true, unit: true, code: true } } } },
        batches:       true,
      },
    });
  });

  return NextResponse.json(result, { status: 201 });
}
