import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { findUnitByBarcode } from '@/lib/barcode';

/** Cross-verify: lookup controller by any stage barcode (PS, BB, QC, or Final). Returns full unit with all stage barcodes and logs. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ barcode: string }> }
) {
  try {
    await requireSession();
    const barcode = decodeURIComponent((await params).barcode).trim();
    if (!barcode) return NextResponse.json({ error: 'Barcode required' }, { status: 400 });

    const unit = await findUnitByBarcode(barcode);
    if (!unit) return NextResponse.json({ error: 'Controller not found' }, { status: 404 });
    return NextResponse.json(unit);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
