import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/procurement/material-serials?grnId=xxx — list serials for a GRN
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'STORE_MANAGER', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const grnId = searchParams.get('grnId');

  if (!grnId) return NextResponse.json({ error: 'grnId required' }, { status: 400 });

  const serials = await prisma.materialSerial.findMany({
    where: { grnId },
    include: {
      material: { select: { id: true, name: true, code: true, unit: true } },
    },
    orderBy: { barcode: 'asc' },
  });

  return NextResponse.json(serials);
}

// PATCH /api/procurement/material-serials — bulk-confirm all PRINTED serials for a GRN
// body: { grnId }
export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'STORE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { grnId } = await req.json() as { grnId: string };
  if (!grnId) return NextResponse.json({ error: 'grnId required' }, { status: 400 });

  const result = await prisma.materialSerial.updateMany({
    where: { grnId, status: 'PRINTED' },
    data: { status: 'CONFIRMED' },
  });

  return NextResponse.json({ confirmed: result.count });
}
