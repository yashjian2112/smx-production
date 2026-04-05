import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/inventory/job-cards/scan-serial
// Body: { barcode: string, jobCardId: string }
// Looks up MaterialSerial by barcode, validates against the job card's items,
// and returns the match info (does NOT consume — that happens at dispatch).
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['INVENTORY_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { barcode, jobCardId, alreadyScannedIds } = await req.json();
  if (!barcode || !jobCardId) {
    return NextResponse.json({ error: 'barcode and jobCardId required' }, { status: 400 });
  }

  // Look up the serial
  const serial = await prisma.materialSerial.findUnique({
    where: { barcode: barcode.trim().toUpperCase() },
    include: { material: { select: { id: true, name: true, code: true, unit: true } } },
  });

  if (!serial) {
    return NextResponse.json({ error: 'Serial not found', barcode }, { status: 404 });
  }

  // Server-side dedup: reject if client already scanned this serial in this session
  if (Array.isArray(alreadyScannedIds) && alreadyScannedIds.includes(serial.id)) {
    return NextResponse.json({ error: `Already scanned (${serial.barcode})`, barcode }, { status: 409 });
  }

  if (serial.status === 'CONSUMED') {
    return NextResponse.json({ error: `Already consumed (${serial.barcode})`, barcode }, { status: 409 });
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

  // Check how many serials are already scanned (pending consumption) for this item
  // This is tracked client-side, but we check if already consumed in DB
  const alreadyConsumed = await prisma.materialSerial.count({
    where: { jobCardItemId: jobCardItem.id, status: 'CONSUMED' },
  });

  if (alreadyConsumed >= jobCardItem.quantityReq) {
    return NextResponse.json({
      error: `"${serial.material.name}" already fully issued for this job card`,
      barcode,
    }, { status: 422 });
  }

  return NextResponse.json({
    serialId: serial.id,
    barcode: serial.barcode,
    packQty: serial.quantity,           // how many units this pack represents
    materialId: serial.materialId,
    materialName: serial.material.name,
    materialCode: serial.material.code,
    materialUnit: serial.material.unit,
    jobCardItemId: jobCardItem.id,
    quantityReq: jobCardItem.quantityReq,
    alreadyConsumed,
  });
}
