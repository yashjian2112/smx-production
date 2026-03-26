import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StageType } from '@prisma/client';

export async function GET(req: NextRequest) {
  await requireSession();
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('productId');

  const items = await prisma.bOMItem.findMany({
    where: productId ? { productId } : {},
    include: { rawMaterial: { select: { id: true, name: true, code: true, unit: true } } },
    orderBy: [{ stage: 'asc' }, { voltage: 'asc' }],
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['INVENTORY_MANAGER', 'STORE_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { productId, rawMaterialId, voltage, stage, quantityRequired, unit, notes } = body;

  const item = await prisma.bOMItem.create({
    data: {
      productId,
      rawMaterialId,
      voltage: voltage || null,
      stage: stage ? (stage as StageType) : null,
      quantityRequired,
      unit,
      notes: notes || null,
    },
    include: { rawMaterial: { select: { id: true, name: true, code: true, unit: true } } },
  });
  return NextResponse.json(item);
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (!['INVENTORY_MANAGER', 'STORE_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const { id, isCritical } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const updated = await prisma.bOMItem.update({
    where: { id },
    data: { isCritical: Boolean(isCritical) },
    include: { rawMaterial: { select: { id: true, name: true, code: true, unit: true } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (!['INVENTORY_MANAGER', 'STORE_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  await prisma.bOMItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
