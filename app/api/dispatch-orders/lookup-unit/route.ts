import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/dispatch-orders/lookup-unit?barcode=&orderId=
 * Validate a barcode/serial before adding to a box.
 * Returns unit info without adding it to any box.
 * Used by the packing inspection step.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'PACKING');

    const { searchParams } = new URL(req.url);
    const barcode = searchParams.get('barcode')?.trim().toUpperCase();
    const orderId = searchParams.get('orderId');

    if (!barcode) return NextResponse.json({ error: 'barcode is required' }, { status: 400 });
    if (!orderId)  return NextResponse.json({ error: 'orderId is required' },  { status: 400 });

    const unit = await prisma.controllerUnit.findFirst({
      where: {
        OR: [
          { finalAssemblyBarcode: barcode },
          { serialNumber: barcode },
        ],
      },
      select: {
        id:                   true,
        serialNumber:         true,
        finalAssemblyBarcode: true,
        currentStage:         true,
        currentStatus:        true,
        readyForDispatch:     true,
        orderId:              true,
        packingBoxItem:       { select: { id: true } },
        dispatchOrderScan:    { select: { id: true } },
      },
    });

    if (!unit) return NextResponse.json({ error: 'Unit not found for this barcode / serial' }, { status: 404 });
    if (unit.currentStage !== 'FINAL_ASSEMBLY')
      return NextResponse.json({ error: 'Unit is not in FINAL_ASSEMBLY stage' }, { status: 400 });
    if (unit.currentStatus !== 'COMPLETED' && unit.currentStatus !== 'APPROVED')
      return NextResponse.json({ error: `Unit status must be COMPLETED or APPROVED, got ${unit.currentStatus}` }, { status: 400 });
    if (unit.readyForDispatch)
      return NextResponse.json({ error: 'Unit has already been dispatched' }, { status: 400 });
    if (unit.orderId !== orderId)
      return NextResponse.json({ error: 'Unit does not belong to this order' }, { status: 400 });
    if (unit.packingBoxItem)
      return NextResponse.json({ error: 'Unit is already packed in a box' }, { status: 400 });
    if (unit.dispatchOrderScan)
      return NextResponse.json({ error: 'Unit is already staged in a dispatch order' }, { status: 400 });

    return NextResponse.json({
      id:                   unit.id,
      serialNumber:         unit.serialNumber,
      finalAssemblyBarcode: unit.finalAssemblyBarcode,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
