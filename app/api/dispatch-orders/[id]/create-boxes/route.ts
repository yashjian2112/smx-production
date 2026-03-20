import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const boxDetailSchema = z.object({
  boxSizeId: z.string().min(1),
  weightKg:  z.number().positive().optional(),
});

const schema = z.object({
  boxes: z.array(boxDetailSchema).min(1).max(50),
});

/**
 * POST /api/dispatch-orders/[id]/create-boxes
 * Distribute staged scans evenly into N boxes (with pre-filled size/weight),
 * then transition DO → PACKING.
 * Body: { boxes: [ { boxSizeId, weightKg }, ... ] }
 * Box count = boxes.length.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'PACKING');

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { boxes: boxDetails } = parsed.data;
    const boxCount = boxDetails.length;

    // Validate all box sizes exist
    const sizeIds = Array.from(new Set(boxDetails.map((b) => b.boxSizeId)));
    const sizes = await prisma.boxSize.findMany({ where: { id: { in: sizeIds }, active: true }, select: { id: true } });
    const validSizeIds = new Set(sizes.map((s) => s.id));
    for (const d of boxDetails) {
      if (!validSizeIds.has(d.boxSizeId))
        return NextResponse.json({ error: `Box size not found: ${d.boxSizeId}` }, { status: 400 });
    }

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        doNumber: true,
        dispatchQty: true,
        scans: {
          orderBy: { scannedAt: 'asc' },
          select: { id: true, unitId: true, serial: true, barcode: true, scannedById: true, inspectionPhotoUrl: true },
        },
      },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'OPEN')
      return NextResponse.json({ error: 'Dispatch order must be OPEN to create boxes' }, { status: 400 });
    if (dispatchOrder.dispatchQty === 0)
      return NextResponse.json({ error: 'Dispatch quantity not set. Reload the page and try again.' }, { status: 400 });

    const scans = dispatchOrder.scans;
    if (scans.length === 0)
      return NextResponse.json({ error: 'No units scanned. Scan at least one unit first.' }, { status: 400 });
    if (scans.length !== dispatchOrder.dispatchQty)
      return NextResponse.json({ error: `Scanned ${scans.length} unit(s) but dispatch quantity is ${dispatchOrder.dispatchQty}. Scan all units first.` }, { status: 400 });
    if (boxCount > scans.length)
      return NextResponse.json({ error: `Cannot create ${boxCount} boxes for ${scans.length} unit(s).` }, { status: 400 });

    const doNumber = dispatchOrder.doNumber;
    const base      = Math.floor(scans.length / boxCount);
    const remainder = scans.length % boxCount;

    await prisma.$transaction(async (tx) => {
      await tx.dispatchOrder.update({
        where: { id: params.id },
        data: { status: 'PACKING', totalBoxes: boxCount },
      });

      let scanIdx = 0;
      for (let i = 0; i < boxCount; i++) {
        const boxNum    = i + 1;
        const itemCount = base + (i < remainder ? 1 : 0);
        const boxLabel  = `${doNumber}-BOX-${boxNum}of${boxCount}`;
        const detail    = boxDetails[i];

        const box = await tx.packingBox.create({
          data: {
            dispatchOrderId: params.id,
            boxNumber:  boxNum,
            boxLabel,
            isSealed:   false,
            weightKg:   detail.weightKg ?? null,
            boxSizeId:  detail.boxSizeId,
          },
        });

        for (let j = 0; j < itemCount; j++) {
          const scan = scans[scanIdx++];
          await tx.packingBoxItem.create({
            data: {
              boxId:              box.id,
              unitId:             scan.unitId,
              serial:             scan.serial,
              barcode:            scan.barcode,
              scannedById:        scan.scannedById,
              inspectionPhotoUrl: scan.inspectionPhotoUrl ?? null,
            },
          });
        }
      }

      await tx.dispatchOrderScan.deleteMany({ where: { dispatchOrderId: params.id } });
    });

    const updated = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      include: {
        order: {
          select: {
            orderNumber: true,
            quantity:    true,
            client:      { select: { customerName: true } },
            product:     { select: { code: true, name: true } },
          },
        },
        createdBy:  { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        scans: {
          orderBy: { scannedAt: 'asc' },
          include: { unit: { select: { serialNumber: true, finalAssemblyBarcode: true } } },
        },
        boxes: {
          orderBy: { boxNumber: 'asc' },
          include: {
            boxSize: true,
            items: {
              orderBy: { scannedAt: 'asc' },
              include: { unit: { select: { serialNumber: true, finalAssemblyBarcode: true } } },
            },
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
