import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { findUnitByBarcode, findComponentByBarcode, findUnitByComponentBarcode, STAGE_BARCODE_FIELD } from '@/lib/barcode';
import { tryAssignBoardSerial } from '@/lib/board-assign';

const STAGE_LABEL: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage',
  BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY:      'Assembly',
  QC_AND_SOFTWARE:          'QC & Software',
  FINAL_ASSEMBLY:           'Final Assembly',
};

/** Lookup controller by stage barcode.
 *  Optional ?stage=STAGE_KEY restricts search to that stage's barcode field.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ barcode: string }> }
) {
  try {
    await requireSession();
    const barcode = decodeURIComponent((await params).barcode).trim();
    if (!barcode) return NextResponse.json({ error: 'Barcode required' }, { status: 400 });

    const stage = req.nextUrl.searchParams.get('stage') ?? undefined;
    let unit = await findUnitByBarcode(barcode, stage);

    // If no unit found, try board serial assignment (employee scanned a board)
    if (!unit) {
      unit = await tryAssignBoardSerial(barcode);
    }

    if (!unit) {
      // If stage-specific search failed, check if the barcode exists in a DIFFERENT stage
      if (stage && STAGE_BARCODE_FIELD[stage]) {
        const anyUnit = await findUnitByBarcode(barcode);
        if (anyUnit) {
          if (anyUnit.currentStage === stage) {
            return NextResponse.json(anyUnit);
          }
          const stageLabel = STAGE_LABEL[stage] ?? stage;
          return NextResponse.json({
            error: `This barcode belongs to unit ${anyUnit.serialNumber} but is NOT a ${stageLabel} barcode. Please scan the correct ${stageLabel} label (e.g. C350PS26001 for Powerstage).`,
          }, { status: 404 });
        }
      }
      // Check if it's a component barcode
      const component = await findComponentByBarcode(barcode);
      if (component) {
        const unitByComp = await findUnitByComponentBarcode(barcode);
        if (unitByComp) {
          return NextResponse.json(unitByComp);
        }
        return NextResponse.json({
          error: `Scanned ${component.name} component barcode but no pending unit found at that stage. Make sure an order is active for this product.`,
        }, { status: 404 });
      }
      return NextResponse.json({
        error: 'No unit found for this barcode. Check that you scanned the correct stage label.',
      }, { status: 404 });
    }
    return NextResponse.json(unit);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
