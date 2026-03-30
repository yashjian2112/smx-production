import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextBatchCode } from '@/lib/invoice-number';

const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER'] as const;

const itemSchema = z.object({
  rawMaterialId:    z.string(),
  quantity:         z.number().positive(),
  unitPrice:        z.number().min(0).default(0),
  manufacturingDate:z.string().optional(),
  expiryDate:       z.string().optional(),
});

const schema = z.object({
  supplier:   z.string().optional(),
  invoiceRef: z.string().optional(),
  notes:      z.string().optional(),
  items:      z.array(itemSchema).min(1),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = schema.parse(body);

  const reference = data.invoiceRef
    ? `DIRECT-${data.invoiceRef}`
    : `DIRECT-${Date.now()}`;

  const result = await prisma.$transaction(async (tx) => {
    const batchesCreated = [];

    for (const item of data.items) {
      const material = await tx.rawMaterial.findUnique({ where: { id: item.rawMaterialId } });
      if (!material) throw new Error(`Material ${item.rawMaterialId} not found`);

      // Create batch
      const batchCode = await generateNextBatchCode();
      const batch = await tx.inventoryBatch.create({
        data: {
          batchCode,
          rawMaterialId:    item.rawMaterialId,
          quantity:         item.quantity,
          remainingQty:     item.quantity,
          unitPrice:        item.unitPrice,
          condition:        'GOOD',
          manufacturingDate: item.manufacturingDate ? new Date(item.manufacturingDate) : null,
          expiryDate:        item.expiryDate ? new Date(item.expiryDate) : null,
          notes:            data.supplier ? `Direct receipt from ${data.supplier}` : 'Direct receipt',
        },
      });
      batchesCreated.push(batch);

      // Update stock
      await tx.rawMaterial.update({
        where: { id: item.rawMaterialId },
        data:  { currentStock: { increment: item.quantity } },
      });

      // Audit movement
      await tx.stockMovement.create({
        data: {
          rawMaterialId: item.rawMaterialId,
          type:          'IN',
          quantity:      item.quantity,
          reference,
          notes: [data.supplier && `Supplier: ${data.supplier}`, data.notes].filter(Boolean).join(' · ') || 'Direct receipt',
          createdById:   session.id,
        },
      });
    }

    return { batchesCreated, reference };
  });

  return NextResponse.json(result, { status: 201 });
}
