import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'] as const;

const updateSchema = z.object({
  name:             z.string().min(1).optional(),
  purchaseUnit:     z.string().min(1).optional(),
  stockUnit:        z.string().min(1).optional(),
  conversionFactor: z.number().positive().optional(),
  description:      z.string().nullable().optional(),
});

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await prisma.packSize.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const data = updateSchema.parse(body);
  const packSize = await prisma.packSize.update({ where: { id: params.id }, data });
  return NextResponse.json(packSize);
}
