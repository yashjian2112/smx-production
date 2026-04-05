import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { findUnitByBarcode, findComponentByBarcode, findUnitByComponentBarcode } from '@/lib/barcode';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ barcode: string }> }) {
  try {
    await requireSession();
    const { barcode } = await params;
    let unit = await findUnitByBarcode(barcode);

    // If no unit found, check if this is a board serial from inventory.
    // Board serials get assigned to units on first scan (not at dispatch).
    if (!unit) {
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

      if (serial?.jobCardItem) {
        const { orderId, stage, order } = serial.jobCardItem.jobCard;

        // Check if this material is a board item in BOM
        const bomItem = await prisma.bOMItem.findFirst({
          where: {
            productId: order.productId,
            rawMaterialId: serial.materialId,
            stage: stage,
            isBoard: true,
          },
        });

        if (bomItem) {
          // Determine barcode field from stage
          const barcodeField = stage === 'POWERSTAGE_MANUFACTURING'
            ? 'powerstageBarcode'
            : stage === 'BRAINBOARD_MANUFACTURING'
              ? 'brainboardBarcode'
              : null;

          if (barcodeField) {
            // If serial already assigned to a unit, return that unit
            if (serial.allocatedToUnitId) {
              unit = await findUnitByBarcode(barcode);
            }

            // Otherwise assign to first unassigned unit for this order+stage
            if (!unit) {
              const unassigned = await prisma.controllerUnit.findFirst({
                where: {
                  orderId,
                  currentStage: stage,
                  [barcodeField]: null,
                },
                orderBy: { createdAt: 'asc' },
              });

              if (unassigned) {
                // Assign board barcode to unit
                await prisma.controllerUnit.update({
                  where: { id: unassigned.id },
                  data: { [barcodeField]: serial.barcode },
                });
                // Link serial to unit
                await prisma.materialSerial.update({
                  where: { id: serial.id },
                  data: { allocatedToUnitId: unassigned.id },
                });

                // Now fetch the full unit
                unit = await findUnitByBarcode(barcode);
              }
            }
          }
        }
      }
    }

    if (!unit) {
      // Check if the scanned barcode is a component barcode — try to find a matching unit
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
