import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const scanSchema = z.object({
  barcode:            z.string().min(1),
  inspectionPhotoUrl: z.string().url().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; boxId: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'PACKING');

    const body = await req.json();
    const parsed = scanSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { barcode, inspectionPhotoUrl } = parsed.data;

    // Fetch the dispatch order
    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, orderId: true },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'PACKING')
      return NextResponse.json({ error: 'Dispatch order must be in PACKING status to scan units' }, { status: 400 });

    // Fetch the box
    const box = await prisma.packingBox.findUnique({
      where: { id: params.boxId },
      select: { id: true, dispatchOrderId: true, isSealed: true },
    });
    if (!box) return NextResponse.json({ error: 'Box not found' }, { status: 404 });
    if (box.dispatchOrderId !== params.id)
      return NextResponse.json({ error: 'Box does not belong to this dispatch order' }, { status: 400 });
    if (box.isSealed)
      return NextResponse.json({ error: 'Box is already sealed' }, { status: 400 });

    // Find unit by finalAssemblyBarcode OR serialNumber
    const unit = await prisma.controllerUnit.findFirst({
      where: {
        OR: [
          { finalAssemblyBarcode: barcode },
          { serialNumber: barcode },
        ],
      },
      select: {
        id: true,
        serialNumber: true,
        finalAssemblyBarcode: true,
        currentStage: true,
        currentStatus: true,
        readyForDispatch: true,
        orderId: true,
        packingBoxItem: { select: { id: true, boxId: true } },
      },
    });

    if (!unit) return NextResponse.json({ error: 'Unit not found for this barcode/serial' }, { status: 404 });

    // Must be in FINAL_ASSEMBLY stage
    if (unit.currentStage !== 'FINAL_ASSEMBLY')
      return NextResponse.json({ error: 'Unit is not in FINAL_ASSEMBLY stage' }, { status: 400 });

    // Must be COMPLETED or APPROVED
    if (unit.currentStatus !== 'COMPLETED' && unit.currentStatus !== 'APPROVED')
      return NextResponse.json(
        { error: `Unit status must be COMPLETED or APPROVED, got ${unit.currentStatus}` },
        { status: 400 }
      );

    // Must not already be dispatched
    if (unit.readyForDispatch)
      return NextResponse.json({ error: 'Unit has already been dispatched' }, { status: 400 });

    // Must belong to the same order as the dispatch order
    if (unit.orderId !== dispatchOrder.orderId)
      return NextResponse.json({ error: 'Unit does not belong to the same order as this dispatch order' }, { status: 400 });

    // Must not already be in a PackingBoxItem
    if (unit.packingBoxItem)
      return NextResponse.json({ error: 'Unit is already packed in a box' }, { status: 400 });

    // Create the PackingBoxItem
    await prisma.packingBoxItem.create({
      data: {
        boxId:              params.boxId,
        unitId:             unit.id,
        serial:             unit.serialNumber,
        barcode:            unit.finalAssemblyBarcode ?? unit.serialNumber,
        scannedById:        session.id,
        inspectionPhotoUrl: inspectionPhotoUrl ?? null,
      },
    });

    // Return updated box with items
    const updatedBox = await prisma.packingBox.findUnique({
      where: { id: params.boxId },
      include: {
        items: {
          orderBy: { scannedAt: 'asc' },
          include: {
            unit: { select: { serialNumber: true, finalAssemblyBarcode: true } },
          },
        },
      },
    });

    return NextResponse.json(updatedBox, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
