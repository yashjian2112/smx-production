import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { z } from 'zod';

const scanSchema = z.object({
  barcode:            z.string().min(1),
  harnessBarcode:     z.string().optional(),
  inspectionPhotoUrl: z.string().url().optional(),
});

/**
 * POST /api/dispatch-orders/[id]/scans
 * Stage-scan a unit at the DO level (before boxes are created).
 * DO must be OPEN. Unit is validated and added to DispatchOrderScan staging table.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'SHIPPING', 'PACKING');

    const body = await req.json();
    const parsed = scanSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { barcode, harnessBarcode, inspectionPhotoUrl } = parsed.data;

    // Fetch the dispatch order
    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, orderId: true },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'OPEN')
      return NextResponse.json({ error: 'Dispatch order must be OPEN to stage-scan units' }, { status: 400 });

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
        packingBoxItem:   { select: { id: true } },
        dispatchOrderScan: { select: { id: true, dispatchOrderId: true } },
      },
    });

    if (!unit) return NextResponse.json({ error: 'Unit not found for this barcode/serial' }, { status: 404 });

    if (unit.currentStage !== 'FINAL_ASSEMBLY')
      return NextResponse.json({ error: 'Unit is not in FINAL_ASSEMBLY stage' }, { status: 400 });

    if (unit.currentStatus !== 'COMPLETED' && unit.currentStatus !== 'APPROVED')
      return NextResponse.json(
        { error: `Unit status must be COMPLETED or APPROVED, got ${unit.currentStatus}` },
        { status: 400 }
      );

    if (unit.readyForDispatch)
      return NextResponse.json({ error: 'Unit has already been dispatched' }, { status: 400 });

    if (unit.orderId !== dispatchOrder.orderId)
      return NextResponse.json({ error: 'Unit does not belong to the same order as this dispatch order' }, { status: 400 });

    if (unit.packingBoxItem)
      return NextResponse.json({ error: 'Unit is already packed in a box' }, { status: 400 });

    if (unit.dispatchOrderScan) {
      if (unit.dispatchOrderScan.dispatchOrderId === params.id)
        return NextResponse.json({ error: 'Unit is already staged in this dispatch order' }, { status: 400 });
      return NextResponse.json({ error: 'Unit is already staged in another dispatch order' }, { status: 400 });
    }

    // ── Harness pairing ──
    let pairedHarness: { id: string; serialNumber: string; barcode: string } | null = null;
    const order = await prisma.order.findUnique({
      where: { id: dispatchOrder.orderId },
      select: { harnessRequired: true },
    });

    if (order?.harnessRequired && !harnessBarcode) {
      return NextResponse.json({ error: 'This order requires a harness. Scan the harness barcode along with the controller.', requiresHarness: true }, { status: 400 });
    }

    if (harnessBarcode) {
      const harness = await prisma.harnessUnit.findFirst({
        where: { barcode: harnessBarcode.trim() },
        select: { id: true, serialNumber: true, barcode: true, status: true, orderId: true, pairedController: { select: { id: true } } },
      });
      if (!harness) return NextResponse.json({ error: 'Harness unit not found for this barcode' }, { status: 404 });
      if (harness.status !== 'READY' && harness.status !== 'QC_PASSED')
        return NextResponse.json({ error: `Harness must be READY for dispatch, got ${harness.status}` }, { status: 400 });
      if (harness.orderId !== dispatchOrder.orderId)
        return NextResponse.json({ error: 'Harness does not belong to the same order' }, { status: 400 });
      if (harness.pairedController)
        return NextResponse.json({ error: 'This harness is already paired with another controller' }, { status: 400 });

      await prisma.controllerUnit.update({
        where: { id: unit.id },
        data: { pairedHarnessId: harness.id },
      });
      await prisma.harnessUnit.update({
        where: { id: harness.id },
        data: { status: 'DISPATCHED' },
      });
      pairedHarness = { id: harness.id, serialNumber: harness.serialNumber, barcode: harness.barcode };

      await appendTimeline({
        unitId: unit.id,
        orderId: unit.orderId,
        userId: session.id,
        action: 'harness_paired',
        remarks: `Controller ${unit.serialNumber} paired with harness ${harness.barcode}`,
      });
    }

    // Create staging scan
    const scan = await prisma.dispatchOrderScan.create({
      data: {
        dispatchOrderId:    params.id,
        unitId:             unit.id,
        serial:             unit.serialNumber,
        barcode:            unit.finalAssemblyBarcode ?? unit.serialNumber,
        scannedById:        session.id,
        inspectionPhotoUrl: inspectionPhotoUrl ?? null,
      },
      include: {
        unit: { select: { serialNumber: true, finalAssemblyBarcode: true } },
      },
    });

    return NextResponse.json({ scan, pairedHarness }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
