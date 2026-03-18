import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/dispatch-orders/[id]/scans
// Scan a unit barcode into the staging table for this DO
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING');

    const { barcode } = await req.json() as { barcode?: string };
    if (!barcode) return NextResponse.json({ error: 'barcode required' }, { status: 400 });

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where:  { id: params.id },
      select: { id: true, status: true, orderId: true },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'OPEN')
      return NextResponse.json({ error: 'Can only scan while DO is OPEN' }, { status: 400 });

    // Look up the unit by any barcode
    const unit = await prisma.controllerUnit.findFirst({
      where: {
        OR: [
          { finalAssemblyBarcode: barcode },
          { assemblyBarcode: barcode },
          { qcBarcode: barcode },
          { serialNumber: barcode },
        ],
      },
      select: { id: true, serialNumber: true, finalAssemblyBarcode: true, orderId: true, readyForDispatch: true },
    });

    if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    if (unit.orderId !== dispatchOrder.orderId)
      return NextResponse.json({ error: 'Unit does not belong to this order' }, { status: 400 });
    if (!unit.readyForDispatch)
      return NextResponse.json({ error: 'Unit is not ready for dispatch' }, { status: 400 });

    // Check if already staged (same or different DO)
    const existing = await prisma.dispatchOrderScan.findUnique({ where: { unitId: unit.id } });
    if (existing) {
      const msg = existing.dispatchOrderId === params.id
        ? 'Unit already scanned in this dispatch order'
        : 'Unit is already staged in another active dispatch order';
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    // Check if already packed in a box (new DO flow)
    const inBox = await prisma.packingBoxItem.findUnique({ where: { unitId: unit.id } });
    if (inBox) return NextResponse.json({ error: 'Unit is already packed in a previous dispatch — cannot scan again' }, { status: 409 });

    // Check if already dispatched via the old Dispatch flow (DispatchItem in an APPROVED Dispatch)
    const oldDispatch = await prisma.dispatchItem.findFirst({
      where: {
        unitId:   unit.id,
        dispatch: { status: 'APPROVED' },
      },
      select: { id: true, dispatch: { select: { dispatchNumber: true } } },
    });
    if (oldDispatch) {
      return NextResponse.json(
        { error: `Unit was already dispatched via ${oldDispatch.dispatch.dispatchNumber ?? 'a previous dispatch'} — cannot scan again` },
        { status: 409 },
      );
    }

    const scan = await prisma.dispatchOrderScan.create({
      data: {
        dispatchOrderId: params.id,
        unitId:          unit.id,
        serial:          unit.serialNumber,
        barcode:         barcode,

        scannedById:     session.id,
      },
    });

    return NextResponse.json({ scan, serial: unit.serialNumber }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// GET /api/dispatch-orders/[id]/scans
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireSession();
    const scans = await prisma.dispatchOrderScan.findMany({
      where:   { dispatchOrderId: params.id },
      orderBy: { scannedAt: 'asc' },
    });
    return NextResponse.json({ scans });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
