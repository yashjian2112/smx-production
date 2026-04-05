import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/inventory/job-cards/scan-serial
// Body: { barcode: string, jobCardId: string }
// Validates serial, checks stock availability, persists scan by setting jobCardItemId.
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['INVENTORY_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { barcode, jobCardId } = await req.json();
  if (!barcode || !jobCardId) {
    return NextResponse.json({ error: 'barcode and jobCardId required' }, { status: 400 });
  }

  // Look up the serial (include currentStock for availability check)
  const serial = await prisma.materialSerial.findUnique({
    where: { barcode: barcode.trim().toUpperCase() },
    include: { material: { select: { id: true, name: true, code: true, unit: true, currentStock: true } } },
  });

  if (!serial) {
    return NextResponse.json({ error: 'Serial not found', barcode }, { status: 404 });
  }

  if (serial.status === 'CONSUMED') {
    return NextResponse.json({ error: `Already consumed (${serial.barcode})`, barcode }, { status: 409 });
  }

  // Server-side dedup: reject if serial is already reserved for any job card
  if (serial.jobCardItemId) {
    return NextResponse.json({ error: `Already scanned (${serial.barcode})`, barcode }, { status: 409 });
  }

  // Find matching job card item
  const jobCardItem = await prisma.jobCardItem.findFirst({
    where: { jobCardId, rawMaterialId: serial.materialId },
    select: { id: true, quantityReq: true, rawMaterialId: true },
  });

  if (!jobCardItem) {
    return NextResponse.json({
      error: `"${serial.material.name}" is not in this job card`,
      barcode,
      materialName: serial.material.name,
    }, { status: 422 });
  }

  // Check how many are already linked to this item (reserved + consumed)
  const linkedSerials = await prisma.materialSerial.findMany({
    where: { jobCardItemId: jobCardItem.id },
    select: { quantity: true },
  });
  const alreadyLinkedQty = linkedSerials.reduce((sum, s) => sum + s.quantity, 0);

  if (alreadyLinkedQty >= jobCardItem.quantityReq) {
    return NextResponse.json({
      error: `"${serial.material.name}" already fully covered for this job card`,
      barcode,
    }, { status: 422 });
  }

  // Stock availability check: currentStock minus all reserved (non-consumed) serials for this material
  const reservedSerials = await prisma.materialSerial.findMany({
    where: {
      materialId: serial.materialId,
      jobCardItemId: { not: null },
      status: { not: 'CONSUMED' },
    },
    select: { quantity: true },
  });
  const reservedQty = reservedSerials.reduce((sum, s) => sum + s.quantity, 0);
  const availableStock = serial.material.currentStock - reservedQty;

  if (serial.quantity > availableStock) {
    return NextResponse.json({
      error: `Insufficient stock for "${serial.material.name}" — available: ${availableStock}, serial pack: ${serial.quantity}`,
      barcode,
      availableStock,
    }, { status: 422 });
  }

  // Persist the scan: link serial to the job card item
  await prisma.materialSerial.update({
    where: { id: serial.id },
    data: { jobCardItemId: jobCardItem.id },
  });

  return NextResponse.json({
    serialId: serial.id,
    barcode: serial.barcode,
    packQty: serial.quantity,
    materialId: serial.materialId,
    materialName: serial.material.name,
    materialCode: serial.material.code,
    materialUnit: serial.material.unit,
    jobCardItemId: jobCardItem.id,
    quantityReq: jobCardItem.quantityReq,
    alreadyLinkedQty: alreadyLinkedQty + serial.quantity,
    availableStock: availableStock - serial.quantity,
  });
}
