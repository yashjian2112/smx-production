import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const patchSchema = z.object({
  action: z.enum(['ISSUE', 'CANCEL']),
});

// PATCH — store manager/admin issues or cancels a material request
export async function PATCH(
  req: Request,
  { params }: { params: { id: string; mid: string } }
) {
  const session = await requireSession();
  if (!['ADMIN', 'STORE_MANAGER', 'PRODUCTION_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const mat = await prisma.reworkMaterial.findUnique({
    where: { id: params.mid },
    include: { returnRequest: { select: { returnNumber: true } }, rawMaterial: true },
  });
  if (!mat) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (mat.returnRequestId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (mat.status !== 'PENDING') return NextResponse.json({ error: `Already ${mat.status.toLowerCase()}` }, { status: 400 });

  if (parsed.data.action === 'CANCEL') {
    const updated = await prisma.reworkMaterial.update({
      where: { id: params.mid },
      data:  { status: 'CANCELLED' },
    });
    return NextResponse.json(updated);
  }

  // ISSUE — deduct stock atomically (same pattern as /api/inventory/issue)
  const discreteUnits = ['pcs', 'pieces', 'units', 'nos', 'sets', 'pc', 'unit', 'no'];
  if (discreteUnits.includes(mat.unit.toLowerCase()) && !Number.isInteger(mat.qtyRequested)) {
    return NextResponse.json({ error: `Quantity must be whole number for unit: ${mat.unit}` }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.rawMaterial.updateMany({
        where: { id: mat.rawMaterialId, currentStock: { gte: mat.qtyRequested } },
        data:  { currentStock: { decrement: mat.qtyRequested } },
      });
      if (updated.count === 0) throw new Error('Insufficient stock');

      // FIFO batch deduction
      let remaining = mat.qtyRequested;
      const batches = await tx.inventoryBatch.findMany({
        where:   { rawMaterialId: mat.rawMaterialId, remainingQty: { gt: 0 } },
        orderBy: { createdAt: 'asc' },
      });
      for (const batch of batches) {
        if (remaining <= 0) break;
        const consume = Math.min(batch.remainingQty, remaining);
        await tx.inventoryBatch.update({ where: { id: batch.id }, data: { remainingQty: batch.remainingQty - consume } });
        remaining -= consume;
      }

      // Audit: stock movement OUT referencing RTN number
      await tx.stockMovement.create({
        data: {
          rawMaterialId:  mat.rawMaterialId,
          type:           'OUT',
          quantity:       -mat.qtyRequested,
          reference:      mat.returnRequest?.returnNumber ?? 'Rework',
          adjustmentType: 'PRODUCTION',
          notes:          `Rework issue — ${mat.returnRequest?.returnNumber ?? 'Standalone'}`,
          createdById:    session.id,
        },
      });

      return tx.reworkMaterial.update({
        where: { id: params.mid },
        data: {
          status:     'ISSUED',
          qtyIssued:  mat.qtyRequested,
          issuedById: session.id,
          issuedAt:   new Date(),
        },
      });
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'Insufficient stock') {
      return NextResponse.json(
        { error: `Insufficient stock. Available: ${mat.rawMaterial.currentStock} ${mat.unit}` },
        { status: 400 }
      );
    }
    throw err;
  }
}

// DELETE — requester can remove a pending request
export async function DELETE(
  req: Request,
  { params }: { params: { id: string; mid: string } }
) {
  const session = await requireSession();
  if (!['ADMIN', 'PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER', 'STORE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const mat = await prisma.reworkMaterial.findUnique({ where: { id: params.mid } });
  if (!mat || mat.returnRequestId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (mat.status !== 'PENDING') return NextResponse.json({ error: 'Cannot delete — already issued/cancelled' }, { status: 400 });

  await prisma.reworkMaterial.delete({ where: { id: params.mid } });
  return NextResponse.json({ ok: true });
}
