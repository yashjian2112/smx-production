import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER'] as const;

const issueSchema = z.object({
  rawMaterialId: z.string(),
  quantity:      z.number().positive(),
  purpose:       z.enum(['PRODUCTION', 'SCRAP', 'SAMPLE', 'RETURN_TO_VENDOR', 'DAMAGE', 'OTHER']),
  notes:         z.string().min(1),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = issueSchema.parse(body);

  const material = await prisma.rawMaterial.findUnique({ where: { id: data.rawMaterialId } });
  if (!material) return NextResponse.json({ error: 'Material not found' }, { status: 404 });
  if (material.currentStock < data.quantity) {
    return NextResponse.json({ error: `Insufficient stock. Available: ${material.currentStock} ${material.unit}` }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // FIFO deduction: consume from oldest batch first
    let remaining = data.quantity;
    const batches = await tx.inventoryBatch.findMany({
      where:   { rawMaterialId: data.rawMaterialId, remainingQty: { gt: 0 } },
      orderBy: { createdAt: 'asc' }, // oldest first = FIFO
    });

    for (const batch of batches) {
      if (remaining <= 0) break;
      const consume = Math.min(batch.remainingQty, remaining);
      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data:  { remainingQty: batch.remainingQty - consume },
      });
      remaining -= consume;
    }

    // Update material stock
    const updated = await tx.rawMaterial.update({
      where: { id: data.rawMaterialId },
      data:  { currentStock: material.currentStock - data.quantity },
    });

    // Audit record
    await tx.stockMovement.create({
      data: {
        rawMaterialId:  data.rawMaterialId,
        type:           'OUT',
        quantity:       -data.quantity,
        reference:      data.purpose,
        adjustmentType: data.purpose,
        notes:          data.notes,
        createdById:    session.id,
      },
    });

    return updated;
  });

  return NextResponse.json(result, { status: 201 });
}
