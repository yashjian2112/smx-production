import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  boxCount: z.number().int().min(1).max(50),
});

/**
 * POST /api/dispatch-orders/[id]/create-boxes
 * Distribute staged scans evenly into N boxes, then transition DO → PACKING.
 * Staged DispatchOrderScan records become PackingBoxItem records.
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

    const { boxCount } = parsed.data;

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        status: true,
        doNumber: true,
        scans: {
          orderBy: { scannedAt: 'asc' },
          select: {
            id: true,
            unitId: true,
            serial: true,
            barcode: true,
            scannedById: true,
            inspectionPhotoUrl: true,
          },
        },
      },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'OPEN')
      return NextResponse.json({ error: 'Dispatch order must be OPEN to create boxes' }, { status: 400 });

    const scans = dispatchOrder.scans;
    if (scans.length === 0)
      return NextResponse.json({ error: 'No units have been staged. Scan at least one unit first.' }, { status: 400 });

    if (boxCount > scans.length)
      return NextResponse.json(
        { error: `Cannot create ${boxCount} boxes for ${scans.length} unit(s). Box count must not exceed unit count.` },
        { status: 400 }
      );

    const doNumber = dispatchOrder.doNumber;

    // Distribute scans evenly: first `remainder` boxes get one extra unit
    const base      = Math.floor(scans.length / boxCount);
    const remainder = scans.length % boxCount;

    const result = await prisma.$transaction(async (tx) => {
      // Transition DO → PACKING
      await tx.dispatchOrder.update({
        where: { id: params.id },
        data: { status: 'PACKING', totalBoxes: boxCount },
      });

      let scanIdx = 0;
      for (let i = 0; i < boxCount; i++) {
        const boxNum   = i + 1;
        const itemCount = base + (i < remainder ? 1 : 0);
        const boxLabel  = `${doNumber}-BOX-${boxNum}of${boxCount}`;

        const box = await tx.packingBox.create({
          data: {
            dispatchOrderId: params.id,
            boxNumber: boxNum,
            boxLabel,
            isSealed: false,
          },
        });

        // Assign scans to this box as PackingBoxItems
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

      // Delete all staged scans (now promoted to PackingBoxItems)
      await tx.dispatchOrderScan.deleteMany({
        where: { dispatchOrderId: params.id },
      });

      return boxCount;
    });

    // Return the full updated DO
    const updated = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      include: {
        order: {
          select: {
            orderNumber: true,
            quantity: true,
            client: { select: { customerName: true, globalOrIndian: true } },
            product: { select: { code: true, name: true } },
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
