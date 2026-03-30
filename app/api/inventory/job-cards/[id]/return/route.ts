import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextBatchCode } from '@/lib/invoice-number';

// POST /api/inventory/job-cards/[id]/return
// Employee returns unused materials back to store after job is done.
// Body: { items: [{ jobCardItemId: string, returnQty: number }] }
// Rules:
//   - returnQty cannot exceed (quantityIssued - already returned)
//   - Adds stock back (creates new batch + StockMovement IN)
//   - Updates JobCardItem.returnedQty

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!['PRODUCTION_EMPLOYEE', 'INVENTORY_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { items }: { items: { jobCardItemId: string; returnQty: number }[] } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items array required' }, { status: 400 });
  }

  const jobCard = await prisma.jobCard.findUnique({
    where: { id },
    include: { items: { include: { rawMaterial: { select: { id: true, name: true } } } } }
  });

  if (!jobCard) return NextResponse.json({ error: 'Job card not found' }, { status: 404 });

  // Can only return from IN_PROGRESS or COMPLETED
  if (!['IN_PROGRESS', 'COMPLETED', 'DISPATCHED'].includes(jobCard.status)) {
    return NextResponse.json({ error: `Cannot return materials for job card in ${jobCard.status} status` }, { status: 400 });
  }

  // Validate return quantities
  const errors: string[] = [];
  for (const ret of items) {
    const cardItem = jobCard.items.find(i => i.id === ret.jobCardItemId);
    if (!cardItem) { errors.push(`Item ${ret.jobCardItemId} not found in job card`); continue; }
    const maxReturn = cardItem.quantityIssued - cardItem.returnedQty;
    if (ret.returnQty <= 0) { errors.push(`Return qty must be > 0 for ${cardItem.rawMaterial.name}`); continue; }
    if (ret.returnQty > maxReturn) {
      errors.push(`"${cardItem.rawMaterial.name}": max returnable is ${maxReturn} (issued ${cardItem.quantityIssued}, already returned ${cardItem.returnedQty})`);
    }
  }
  if (errors.length > 0) return NextResponse.json({ error: 'Validation failed', errors }, { status: 422 });

  // Process returns
  await prisma.$transaction(async (tx) => {
    for (const ret of items) {
      if (ret.returnQty <= 0) continue;
      const cardItem = jobCard.items.find(i => i.id === ret.jobCardItemId)!;

      // Add stock back
      const batchCode = await generateNextBatchCode();
      await tx.inventoryBatch.create({
        data: {
          batchCode,
          rawMaterialId: cardItem.rawMaterialId,
          quantity:      ret.returnQty,
          remainingQty:  ret.returnQty,
          unitPrice:     0,
          condition:     'GOOD',
          notes:         `Return from job card ${jobCard.cardNumber}`,
        }
      });

      await tx.rawMaterial.update({
        where: { id: cardItem.rawMaterialId },
        data:  { currentStock: { increment: ret.returnQty } },
      });

      await tx.stockMovement.create({
        data: {
          rawMaterialId:  cardItem.rawMaterialId,
          type:           'IN',
          quantity:       ret.returnQty,
          reference:      jobCard.cardNumber,
          adjustmentType: 'RETURN',
          notes:          `Material return from job card ${jobCard.cardNumber}`,
          createdById:    session.id,
        }
      });

      await tx.jobCardItem.update({
        where: { id: ret.jobCardItemId },
        data:  { returnedQty: { increment: ret.returnQty } },
      });
    }
  });

  const updated = await prisma.jobCard.findUnique({
    where: { id },
    include: {
      order: { select: { orderNumber: true } },
      items: {
        include: {
          rawMaterial: { select: { id: true, name: true, code: true, unit: true, barcode: true, currentStock: true } }
        }
      }
    }
  });

  return NextResponse.json(updated);
}
