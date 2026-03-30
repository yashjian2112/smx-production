import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/procurement/material-serials?grnId=xxx — list serials for a GRN
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'PURCHASE_MANAGER'].includes(session.role)) {
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
