import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/procurement/material-serials?grnId=xxx OR ?materialId=xxx&openingStock=1
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'STORE_MANAGER', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const grnId = searchParams.get('grnId');
  const materialId = searchParams.get('materialId');
  const openingStock = searchParams.get('openingStock');

  if (!grnId && !materialId) return NextResponse.json({ error: 'grnId or materialId required' }, { status: 400 });

  const where = grnId
    ? { grnId }
    : { materialId: materialId!, grnId: null, ...(openingStock ? {} : {}) };

  const serials = await prisma.materialSerial.findMany({
    where,
    include: {
      material: { select: { id: true, name: true, code: true, unit: true, packSize: true } },
    },
    orderBy: { barcode: 'asc' },
  });

  return NextResponse.json(serials);
}

// PATCH /api/procurement/material-serials — bulk-confirm all PRINTED serials
// body: { grnId } OR { materialId } (opening stock — grnId is null)
export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'STORE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { grnId?: string; materialId?: string };
  if (!body.grnId && !body.materialId) {
    return NextResponse.json({ error: 'grnId or materialId required' }, { status: 400 });
  }

  const where = body.grnId
    ? { grnId: body.grnId, status: 'PRINTED' }
    : { materialId: body.materialId!, grnId: null, status: 'PRINTED' };

  const result = await prisma.materialSerial.updateMany({
    where,
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
  });

  return NextResponse.json({ confirmed: result.count });
}
