import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  boxes: z.array(z.object({
    boxSizeId: z.string().min(1),
    weightKg:  z.number().positive(),
  })).min(1).max(50),
  isPartial:     z.boolean().optional(),
  partialReason: z.string().optional(),
});

// POST /api/dispatch-orders/[id]/create-boxes
// Creates N boxes with pre-defined size+weight, distributes staged scans evenly
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING');

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { boxes: boxDefs, isPartial, partialReason } = parsed.data;

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where:   { id: params.id },
      include: {
        scans:  { orderBy: { scannedAt: 'asc' } },
        boxes:  { select: { boxNumber: true } },
      },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'OPEN')
      return NextResponse.json({ error: 'Dispatch order must be OPEN to create boxes' }, { status: 400 });
    if (dispatchOrder.scans.length === 0)
      return NextResponse.json({ error: 'No units scanned yet' }, { status: 400 });

    // Validate all box sizes exist
    const sizeIds = [...new Set(boxDefs.map((b) => b.boxSizeId))];
    const sizes = await prisma.boxSize.findMany({ where: { id: { in: sizeIds } } });
    if (sizes.length !== sizeIds.length)
      return NextResponse.json({ error: 'One or more box sizes not found' }, { status: 400 });

    const scans        = dispatchOrder.scans;
    const boxCount     = boxDefs.length;
    const totalScanned = scans.length;

    // Distribute scans evenly: first `rem` boxes get base+1 units
    const base = Math.floor(totalScanned / boxCount);
    const rem  = totalScanned % boxCount;

    let scanIdx = 0;
    const createdBoxes = [];

    for (let i = 0; i < boxCount; i++) {
      const boxNumber = i + 1;
      const boxLabel  = `${dispatchOrder.doNumber}-BOX-${boxNumber}`;
      const def       = boxDefs[i];
      const count     = base + (i < rem ? 1 : 0);
      const chunk     = scans.slice(scanIdx, scanIdx + count);
      scanIdx += count;

      const box = await prisma.packingBox.create({
        data: {
          dispatchOrderId: params.id,
          boxNumber,
          boxLabel,
          weightKg:  def.weightKg,
          boxSizeId: def.boxSizeId,
        },
        include: {
          boxSize: true,
          items:   { include: { unit: { select: { serialNumber: true, finalAssemblyBarcode: true } } } },
        },
      });

      // Create PackingBoxItems for the distributed units
      if (chunk.length > 0) {
        await prisma.packingBoxItem.createMany({
          data: chunk.map((scan) => ({
            boxId:       box.id,
            unitId:      scan.unitId,
            serial:      scan.serial,
            barcode:     scan.barcode,
            scannedById: session.id,
          })),
        });
      }

      createdBoxes.push(box);
    }

    // Update DO status to PACKING, store totalBoxes
    await prisma.dispatchOrder.update({
      where: { id: params.id },
      data:  {
        status:    'PACKING',
        totalBoxes: boxCount,
      },
    });

    // Delete staging scans
    await prisma.dispatchOrderScan.deleteMany({ where: { dispatchOrderId: params.id } });

    return NextResponse.json({ boxes: createdBoxes, totalBoxes: boxCount }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
