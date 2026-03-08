import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { findUnitByBarcode, findComponentByBarcode } from '@/lib/barcode';

export async function GET(_req: Request, { params }: { params: Promise<{ barcode: string }> }) {
  try {
    await requireSession();
    const { barcode } = await params;
    const unit = await findUnitByBarcode(barcode);
    if (!unit) {
      // Check if the scanned barcode is a component barcode — give a helpful message
      const component = await findComponentByBarcode(barcode);
      if (component) {
        return NextResponse.json({
          error: `"${barcode.toUpperCase()}" is a COMPONENT barcode (${component.name}), not a unit barcode. Unit barcodes include the production year — e.g. C350PS26001 for a C350 Powerstage unit. Please scan the unit's stage label.`,
        }, { status: 404 });
      }
      return NextResponse.json({ error: 'No unit found for this barcode. Check that you scanned the correct stage label.' }, { status: 404 });
    }
    return NextResponse.json({
      unitId: unit.id,
      serialNumber: unit.serialNumber,
      currentStage: unit.currentStage,
      currentStatus: unit.currentStatus,
      order: unit.order,
      product: unit.product,
      stageLogs: unit.stageLogs,
      qcRecords: unit.qcRecords,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
