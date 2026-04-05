import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { findUnitByBarcode, findComponentByBarcode, findUnitByComponentBarcode } from '@/lib/barcode';
import { tryAssignBoardSerial } from '@/lib/board-assign';

export async function GET(_req: Request, { params }: { params: Promise<{ barcode: string }> }) {
  try {
    await requireSession();
    const { barcode } = await params;
    let unit = await findUnitByBarcode(barcode);

    // If no unit found, try board serial assignment (employee scanned a board)
    if (!unit) {
      unit = await tryAssignBoardSerial(barcode);
    }

    if (!unit) {
      const component = await findComponentByBarcode(barcode);
      if (component) {
        const unitByComp = await findUnitByComponentBarcode(barcode);
        if (unitByComp) {
          return NextResponse.json({
            unitId: unitByComp.id,
            serialNumber: unitByComp.serialNumber,
            currentStage: unitByComp.currentStage,
            currentStatus: unitByComp.currentStatus,
            order: unitByComp.order,
            product: unitByComp.product,
            stageLogs: unitByComp.stageLogs,
            qcRecords: unitByComp.qcRecords,
          });
        }
        return NextResponse.json({
          error: `Scanned ${component.name} component barcode but no pending unit found at that stage. Make sure an order is active for this product.`,
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
