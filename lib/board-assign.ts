import { prisma } from '@/lib/prisma';
import { findUnitByBarcode } from '@/lib/barcode';

/**
 * Try to assign a consumed board serial to an unassigned unit on first scan.
 *
 * Flow: Employee scans a board barcode → system finds the consumed serial
 * from the job card → assigns it to the next available unit for that order+stage.
 *
 * This allows PS board 01 + BB board 02 to end up on unit 05 — the physical
 * board the employee picks up determines which unit it becomes.
 *
 * Returns the full unit if assignment succeeds, null otherwise.
 */
export async function tryAssignBoardSerial(barcode: string) {
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

  // Check if this material is marked as a board in BOM
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

  // If already assigned to a unit, just return that unit
  if (serial.allocatedToUnitId) {
    return findUnitByBarcode(barcode);
  }

  // Find next unassigned unit for this order at this stage
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
