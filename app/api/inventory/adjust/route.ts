import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextBatchCode } from '@/lib/invoice-number';

const ALLOWED_ROLES = ['ADMIN', 'INVENTORY_MANAGER', 'STORE_MANAGER'] as const;

const adjustSchema = z.object({
  rawMaterialId:  z.string(),
  type:           z.enum(['OPENING', 'ADJUSTMENT']),
  adjustmentType: z.string().optional(), // DAMAGE | THEFT | EXPIRY | CORRECTION | FOUND | OPENING | PHYSICAL_COUNT
  quantity:       z.number(),  // positive = add, negative = deduct
  reason:         z.string().min(1),
  unitPrice:      z.number().min(0).default(0),
  expiryDate:     z.string().optional(), // ISO date string
  manufacturingDate: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = adjustSchema.parse(body);

  const material = await prisma.rawMaterial.findUnique({ where: { id: data.rawMaterialId } });
  if (!material) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

  const newStock = material.currentStock + data.quantity;
  if (newStock < 0) {
    return NextResponse.json({ error: 'Adjustment would result in negative stock' }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // 1. Update RawMaterial.currentStock
    const updated = await tx.rawMaterial.update({
      where: { id: data.rawMaterialId },
      data:  { currentStock: newStock },
    });

    // 2. Create StockMovement audit record
    await tx.stockMovement.create({
      data: {
        rawMaterialId:  data.rawMaterialId,
        type:           'ADJUSTMENT',
        quantity:       data.quantity,
        reference:      data.type,
        adjustmentType: data.adjustmentType ?? data.type,
        notes:          data.reason,
        createdById:    session.id,
      },
    });

    // 3. For positive adjustments (opening stock / add), create a batch
    let batchId: string | null = null;
    if (data.quantity > 0) {
      const batchCode = await generateNextBatchCode();
      const batch = await tx.inventoryBatch.create({
        data: {
          batchCode,
          rawMaterialId:    data.rawMaterialId,
          quantity:         data.quantity,
          remainingQty:     data.quantity,
          unitPrice:        data.unitPrice,
          condition:        'GOOD',
          expiryDate:       data.expiryDate ? new Date(data.expiryDate) : null,
          manufacturingDate: data.manufacturingDate ? new Date(data.manufacturingDate) : null,
          notes:            `${data.type}: ${data.reason}`,
        },
      });
      batchId = batch.id;
    }

    return { ...updated, batchId };
  });

  // After deduction: check if stock dropped below reorder point → auto-create RO
  if (data.quantity < 0) {
    const updated = await prisma.rawMaterial.findUnique({
      where: { id: data.rawMaterialId },
      select: { id: true, currentStock: true, reorderPoint: true, minimumOrderQty: true },
    });
    if (updated && updated.currentStock <= updated.reorderPoint && updated.minimumOrderQty > 0) {
      const { autoCreateRO } = await import('@/lib/requirement-order');
      await autoCreateRO({
        trigger: 'LOW_STOCK',
        items: [{
          materialId: updated.id,
          qtyRequired: updated.minimumOrderQty,
          notes: `Auto: stock ${updated.currentStock} ≤ reorder point ${updated.reorderPoint}`,
        }],
      });
    }
  }

  return NextResponse.json(result, { status: 201 });
}
