import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { findUnitByBarcode } from '@/lib/barcode';

export async function GET(_req: Request, { params }: { params: Promise<{ barcode: string }> }) {
  try {
    await requireSession();
    const { barcode } = await params;
    const unit = await findUnitByBarcode(barcode);
    if (!unit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
