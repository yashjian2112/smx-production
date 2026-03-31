import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateGRNNumber } from '@/lib/procurement-numbers';
import { generateNextMaterialSerialBarcode } from '@/lib/barcode';

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
    include: { po: { include: { items: true, vendor: { select: { name: true } } } }, grn: true },
  });
  if (!gan) return NextResponse.json({ error: 'GAN not found' }, { status: 404 });
  if (gan.grn) return NextResponse.json({ error: 'GRN already created for this GAN' }, { status: 400 });

  // Prevent received qty exceeding ordered qty
  const qtyErrors: string[] = [];
  for (const item of items) {
    const poItem = gan.po.items.find((pi: { id: string }) => pi.id === item.poItemId) as { id: string; quantity: number; receivedQuantity: number } | undefined;
    if (!poItem) continue;
    const remaining = poItem.quantity - poItem.receivedQuantity;
    if (item.qtyVerified > remaining) {
      qtyErrors.push(`Item ${item.poItemId}: trying to receive ${item.qtyVerified}, only ${remaining} remaining on PO`);
    }
  }
  if (qtyErrors.length > 0) {
    return NextResponse.json({ error: 'Received quantity exceeds PO quantity', details: qtyErrors }, { status: 400 });
  }

  const grnNumber = await generateGRNNumber();
  const poId = (await params).id;

  // Fetch material details (productionStage, category code, packSize) for serial generation
  const materialIds = Array.from(new Set(items.map(i => i.materialId).filter(Boolean)));
  const materials = await prisma.rawMaterial.findMany({
    where: { id: { in: materialIds } },
    select: { id: true, productionStage: true, packSize: true, category: { select: { code: true } } },
  });
  const materialMap = new Map(materials.map(m => [m.id, m]));

  // Pre-generate MaterialSerial barcodes for ALL materials (full serialization)
  // Each serial represents one "pack" of packSize units
  const serialsToCreate: Array<{
    materialId: string;
    stageType: string;
    barcode: string;
    quantity: number;
  }> = [];

  for (const item of items) {
    if (item.qtyVerified <= 0) continue;
    const mat = materialMap.get(item.materialId);
    const categoryCode = mat?.category?.code ?? 'MAT';
    const stageType = mat?.productionStage && ['PS', 'BB'].includes(mat.productionStage)
      ? mat.productionStage
      : 'GN';
    const packSize = mat?.packSize ?? 1;
    const totalUnits = Math.floor(item.qtyVerified);
    const numPacks = Math.ceil(totalUnits / packSize);

    for (let i = 0; i < numPacks; i++) {
      // Last pack may have fewer units if qty doesn't divide evenly
      const unitsInPack = Math.min(packSize, totalUnits - i * packSize);
      const barcode = await generateNextMaterialSerialBarcode(categoryCode, stageType);
      serialsToCreate.push({ materialId: item.materialId, stageType, barcode, quantity: unitsInPack });
    }
  }

  const grn = await prisma.$transaction(async (tx) => {
    // Create GRN
    const created = await tx.goodsReceipt.create({
      data: {
        grnNumber,
        purchaseOrderId: poId,
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

    // Create MaterialSerial records (one per pack)
    if (serialsToCreate.length > 0) {
      await tx.materialSerial.createMany({
        data: serialsToCreate.map(s => ({
          materialId: s.materialId,
          grnId: created.id,
          stageType: s.stageType,
          barcode: s.barcode,
          quantity: s.quantity,
          status: 'PRINTED',
        })),
      });
    }

    // Update stock for each verified item
    for (const item of items) {
      if (item.qtyVerified <= 0) continue;

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
          condition: (item.qtyRejected ?? 0) > 0 ? 'DAMAGED' : 'GOOD',
          notes: `GRN ${grnNumber}`,
        },
      });

      const unitPrice = item.unitPrice ?? 0;
      await tx.rawMaterial.update({
        where: { id: item.materialId },
        data: {
          currentStock: { increment: item.qtyVerified },
          ...(unitPrice > 0 && {
            lastPurchasePrice: unitPrice,
            lastPurchasedAt: new Date(),
            lastPurchasedFrom: gan.po.vendor?.name ?? null,
          }),
        },
      });

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

      await tx.pOItem.update({
        where: { id: item.poItemId },
        data: { receivedQuantity: { increment: item.qtyVerified } },
      });
    }

    // Mark GAN as done
    await tx.goodsArrivalNote.update({ where: { id: ganId }, data: { status: 'GRN_DONE' } });

    // Update PO status
    const poItems = await tx.pOItem.findMany({ where: { purchaseOrderId: poId } });
    const allReceived = poItems.every((pi: { receivedQuantity: number; quantity: number }) => pi.receivedQuantity >= pi.quantity);
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: allReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
    });

    return created;
  });

  // Return GRN with serial count
  const serialCount = serialsToCreate.length;
  return NextResponse.json({ ...grn, materialSerialsGenerated: serialCount }, { status: 201 });
}
