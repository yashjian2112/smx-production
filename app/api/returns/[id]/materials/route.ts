import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// GET — list all materials for this RTN
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!['ADMIN', 'PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER', 'STORE_MANAGER', 'SALES'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const mats = await prisma.reworkMaterial.findMany({
    where: { returnRequestId: params.id },
    include: {
      requestedBy: { select: { name: true } },
      issuedBy:    { select: { name: true } },
      rawMaterial: { select: { currentStock: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(mats.map(m => ({
    ...m,
    currentStock: m.rawMaterial.currentStock,
    createdAt: m.createdAt.toISOString(),
    issuedAt:  m.issuedAt?.toISOString() ?? null,
  })));
}

const postSchema = z.object({
  rawMaterialId: z.string().min(1),
  qtyRequested:  z.number().positive(),
  notes:         z.string().optional(),
});

// POST — employee requests a material against this RTN
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!['ADMIN', 'PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER', 'STORE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const ret = await prisma.returnRequest.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!ret) return NextResponse.json({ error: 'Return request not found' }, { status: 404 });

  const material = await prisma.rawMaterial.findUnique({
    where:  { id: parsed.data.rawMaterialId },
    select: { id: true, name: true, unit: true },
  });
  if (!material) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

  const record = await prisma.reworkMaterial.create({
    data: {
      returnRequestId: params.id,
      rawMaterialId:   material.id,
      materialName:    material.name,
      unit:            material.unit,
      qtyRequested:    parsed.data.qtyRequested,
      notes:           parsed.data.notes ?? null,
      requestedById:   session.id,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
