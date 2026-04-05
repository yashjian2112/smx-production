import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET  /api/inventory/job-cards/[id]/scans — load saved (non-consumed) scans
// DELETE /api/inventory/job-cards/[id]/scans — undo a single scan

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!['INVENTORY_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const jobCard = await prisma.jobCard.findUnique({
    where: { id },
    select: { items: { select: { id: true } } },
  });
  if (!jobCard) return NextResponse.json({ error: 'Job card not found' }, { status: 404 });

  const itemIds = jobCard.items.map(i => i.id);
  if (itemIds.length === 0) return NextResponse.json([]);

  const serials = await prisma.materialSerial.findMany({
    where: { jobCardItemId: { in: itemIds }, status: { not: 'CONSUMED' } },
    include: { material: { select: { id: true, name: true, code: true, unit: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const result = serials.map(s => ({
    serialId: s.id,
    barcode: s.barcode,
    packQty: s.quantity,
    jobCardItemId: s.jobCardItemId,
    materialId: s.material.id,
    materialName: s.material.name,
    materialCode: s.material.code,
  }));

  return NextResponse.json(result);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!['INVENTORY_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { serialId } = await req.json();
  if (!serialId) {
    return NextResponse.json({ error: 'serialId required' }, { status: 400 });
  }

  // Load job card item IDs to verify ownership
  const jobCard = await prisma.jobCard.findUnique({
    where: { id },
    select: { items: { select: { id: true } } },
  });
  if (!jobCard) return NextResponse.json({ error: 'Job card not found' }, { status: 404 });

  const itemIds = new Set(jobCard.items.map(i => i.id));

  const serial = await prisma.materialSerial.findUnique({ where: { id: serialId } });
  if (!serial) return NextResponse.json({ error: 'Serial not found' }, { status: 404 });
  if (!serial.jobCardItemId || !itemIds.has(serial.jobCardItemId)) {
    return NextResponse.json({ error: 'Serial does not belong to this job card' }, { status: 400 });
  }
  if (serial.status === 'CONSUMED') {
    return NextResponse.json({ error: 'Cannot undo consumed serial' }, { status: 400 });
  }

  await prisma.materialSerial.update({
    where: { id: serialId },
    data: { jobCardItemId: null },
  });

  return NextResponse.json({ ok: true });
}
