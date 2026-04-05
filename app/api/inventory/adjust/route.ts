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
  packCount:      z.number().optional(),  // number of packs (for serial generation)
  packSize:       z.number().optional(),  // units per pack
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

  // For opening stock with packs: stock = packCount × packSize (not raw quantity)
  const ps = data.packSize ?? material.packSize ?? 1;
  const stockQty = (data.type === 'OPENING' && data.packCount && data.packCount > 0)
    ? data.packCount * ps
    : data.quantity;

  const newStock = material.currentStock + stockQty;
  if (newStock < 0) {
    return NextResponse.json({ error: 'Adjustment would result in negative stock' }, { status: 400 });
  }

  // Generate batch code OUTSIDE transaction to avoid lock conflicts
  let batchCode: string | null = null;
  if (data.quantity > 0) {
    batchCode = await generateNextBatchCode();
  }

  // Find last serial sequence OUTSIDE transaction to avoid lock issues
  let serialPrefix = '';
  let serialSeqStart = 1;
  if (data.type === 'OPENING' && data.packCount && data.packCount > 0) {
    const mat = await prisma.rawMaterial.findUnique({
      where: { id: data.rawMaterialId },
      select: { barcode: true },
    });
    const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const now = new Date();
    const barcodePrefix = mat?.barcode?.replace(/\d+$/, '').trim().toUpperCase() ?? 'MAT';
    const month = MONTHS[now.getMonth()];
    const year = String(now.getFullYear() % 100).padStart(2, '0');
    serialPrefix = `${barcodePrefix}${month}${year}`;

    // Sequence resets yearly — find max seq across ALL months in current year
    const allSerials = await prisma.materialSerial.findMany({
      where: { materialId: data.rawMaterialId },
      select: { barcode: true },
    });
    const prefixLen = barcodePrefix.length;
    for (const s of allSerials) {
      const bYear = s.barcode.slice(prefixLen + 3, prefixLen + 5);
      if (bYear === year) {
        const seqPart = s.barcode.slice(prefixLen + 5);
        const n = parseInt(seqPart, 10) || 0;
        if (n >= serialSeqStart) serialSeqStart = n + 1;
      }
    }
  }

  try {
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
          quantity:       stockQty,
          reference:      data.type,
          adjustmentType: data.adjustmentType ?? data.type,
          notes:          data.reason,
          createdById:    session.id,
        },
      });

      // 3. For positive adjustments (opening stock / add), create a batch
      let batchId: string | null = null;
      if (stockQty > 0 && batchCode) {
        const batch = await tx.inventoryBatch.create({
          data: {
            batchCode,
            rawMaterialId:    data.rawMaterialId,
            quantity:         stockQty,
            remainingQty:     stockQty,
            unitPrice:        data.unitPrice,
            condition:        'GOOD',
            expiryDate:       data.expiryDate ? new Date(data.expiryDate) : null,
            manufacturingDate: data.manufacturingDate ? new Date(data.manufacturingDate) : null,
            notes:            `${data.type}: ${data.reason}`,
          },
        });
        batchId = batch.id;
      }

      // 4. For OPENING with pack info, generate MaterialSerial barcodes
      const serialIds: string[] = [];
      if (data.type === 'OPENING' && data.packCount && data.packCount > 0 && serialPrefix) {
        // Re-check sequence inside transaction — yearly reset across all months
        const allInTx = await tx.materialSerial.findMany({
          where: { materialId: data.rawMaterialId },
          select: { barcode: true },
        });
        let seq = serialSeqStart;
        const pLen = serialPrefix.length - 5; // barcodePrefix length (minus MON+YY)
        const yr = serialPrefix.slice(-2);
        for (const s of allInTx) {
          const bY = s.barcode.slice(pLen + 3, pLen + 5);
          if (bY === yr) {
            const dbSeq = (parseInt(s.barcode.slice(pLen + 5), 10) || 0) + 1;
            if (dbSeq > seq) seq = dbSeq;
          }
        }

        for (let i = 0; i < data.packCount; i++) {
          const barcode = `${serialPrefix}${String(seq + i).padStart(4, '0')}`;
          // Check for existing barcode before creating
          const existing = await tx.materialSerial.findUnique({ where: { barcode } });
          if (existing) {
            // Skip ahead to find next available
            const lastAgain = await tx.materialSerial.findFirst({
              where: { barcode: { startsWith: serialPrefix } },
              orderBy: { barcode: 'desc' },
              select: { barcode: true },
            });
            const jumpSeq = lastAgain ? (parseInt(lastAgain.barcode.slice(serialPrefix.length), 10) || 0) + 1 : seq + i + 1;
            seq = jumpSeq;
            i = -1; // restart loop with new seq
            serialIds.length = 0;
            continue;
          }
          const serial = await tx.materialSerial.create({
            data: {
              materialId: data.rawMaterialId,
              grnId: null,
              stageType: 'GN',
              barcode,
              quantity: ps,
              status: 'PRINTED',
            },
          });
          serialIds.push(serial.id);
        }
      }

      return { ...updated, batchId, serialIds };
    });

    // After deduction: check if stock dropped below reorder point → auto-create RO
    if (stockQty < 0) {
      const updated = await prisma.rawMaterial.findUnique({
        where: { id: data.rawMaterialId },
        select: { id: true, currentStock: true, reorderPoint: true, minimumOrderQty: true },
      });
      if (updated && updated.currentStock <= updated.reorderPoint && updated.minimumOrderQty > 0) {
        const { autoCreateRO } = await import('@/lib/requirement-order');
        try {
          await autoCreateRO({
            trigger: 'LOW_STOCK',
            items: [{
              materialId: updated.id,
              qtyRequired: updated.minimumOrderQty,
              notes: `Auto: stock ${updated.currentStock} ≤ reorder point ${updated.reorderPoint}`,
            }],
          });
        } catch (roErr) {
          console.error('Auto-RO creation failed:', roErr);
        }
      }
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    console.error('Adjust transaction failed:', err);
    const msg = err?.message?.includes('Unique constraint')
      ? 'Barcode collision — a serial with this prefix already exists. Try again.'
      : (err?.message || 'Transaction failed');
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
