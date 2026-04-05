import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { findUnitByBarcode, findComponentByBarcode, findUnitByComponentBarcode, STAGE_BARCODE_FIELD } from '@/lib/barcode';
import { prisma } from '@/lib/prisma';

const STAGE_LABEL: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage',
  BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY:      'Assembly',
  QC_AND_SOFTWARE:          'QC & Software',
  FINAL_ASSEMBLY:           'Final Assembly',
};

/**
 * Try to assign a consumed board serial to an unassigned unit.
 * Returns the unit if assignment succeeds, null otherwise.
 */
async function tryAssignBoardSerial(barcode: string) {
  const serial = await prisma.materialSerial.findFirst({
    where: { barcode: barcode.trim(), status: 'CONSUMED' },
    select: {
      id: true,
      barcode: true,
      materialId: true,
      allocatedToUnitId: true,
      jobCardItem: {
        select: {
          jobCard: {
            select: { orderId: true, stage: true, order: { select: { productId: true } } }
          }
        }
      }
    }
  });

  if (!serial?.jobCardItem) return null;

  const { orderId, stage, order } = serial.jobCardItem.jobCard;

  const bomItem = await prisma.bOMItem.findFirst({
    where: {
      productId: order.productId,
      rawMaterialId: serial.materialId,
      stage: stage,
      isBoard: true,
    },
  });
  if (!bomItem) return null;

  const barcodeField = stage === 'POWERSTAGE_MANUFACTURING'
    ? 'powerstageBarcode'
    : stage === 'BRAINBOARD_MANUFACTURING'
      ? 'brainboardBarcode'
      : null;
  if (!barcodeField) return null;

  // If already assigned to a unit, return that unit
  if (serial.allocatedToUnitId) {
    return findUnitByBarcode(barcode);
  }

  // Find first unassigned unit for this order+stage
  const unassigned = await prisma.controllerUnit.findFirst({
    where: { orderId, currentStage: stage, [barcodeField]: null },
    orderBy: { createdAt: 'asc' },
  });
  if (!unassigned) return null;

  // Assign board barcode to unit + link serial
  await prisma.controllerUnit.update({
    where: { id: unassigned.id },
    data: { [barcodeField]: serial.barcode },
  });
  await prisma.materialSerial.update({
    where: { id: serial.id },
    data: { allocatedToUnitId: unassigned.id },
  });

  return findUnitByBarcode(barcode);
}

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

    // If no unit found, try board serial assignment
    if (!unit) {
      unit = await tryAssignBoardSerial(barcode);
    }

    if (!unit) {
      // If stage-specific search failed, check if the barcode exists in a DIFFERENT stage
      if (stage && STAGE_BARCODE_FIELD[stage]) {
        const anyUnit = await findUnitByBarcode(barcode); // search all stages
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
