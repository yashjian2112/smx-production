import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'INVENTORY_MANAGER'] as const;

const schema = z.object({
  materialId: z.string().min(1),
  name:       z.string().min(1),
  notes:      z.string().optional(),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = schema.parse(body);

  // Generate barcode: parent barcode + variant seq e.g. MSF001-V1
  const material = await prisma.rawMaterial.findUnique({
    where:  { id: data.materialId },
    select: { barcode: true, code: true, _count: { select: { variants: true } } },
  });
  if (!material) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

  const base    = material.barcode ?? material.code;
  const seq     = String(material._count.variants + 1).padStart(2, '0');
  const barcode = `${base}-V${seq}`;

  const variant = await prisma.materialVariant.create({
    data: { materialId: data.materialId, name: data.name, barcode, notes: data.notes ?? null },
  });

  return NextResponse.json(variant, { status: 201 });
}
