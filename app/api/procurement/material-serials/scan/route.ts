import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/procurement/material-serials/scan — inventory user scans barcode to confirm
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { barcode } = await req.json() as { barcode: string };
  if (!barcode?.trim()) return NextResponse.json({ error: 'barcode required' }, { status: 400 });

  const serial = await prisma.materialSerial.findUnique({
    where: { barcode: barcode.trim().toUpperCase() },
    include: { material: { select: { name: true } } },
  });

  if (!serial) return NextResponse.json({ error: 'Barcode not found in inventory. Please check and try again.' }, { status: 404 });
  if (serial.status === 'CONFIRMED') return NextResponse.json({ ...serial, alreadyConfirmed: true });
  if (serial.status === 'ALLOCATED') return NextResponse.json({ error: 'This unit is already allocated to an order.' }, { status: 400 });
  if (serial.status === 'CONSUMED') return NextResponse.json({ error: 'This unit is already consumed in production.' }, { status: 400 });

  const updated = await prisma.materialSerial.update({
    where: { id: serial.id },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
    include: { material: { select: { name: true } } },
  });

  return NextResponse.json(updated);
}
