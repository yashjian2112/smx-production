import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'] as const;

const createSchema = z.object({
  name:             z.string().min(1),
  purchaseUnit:     z.string().min(1),
  stockUnit:        z.string().min(1),
  conversionFactor: z.number().positive(),
  description:      z.string().optional(),
});

export async function GET() {
  await requireSession();
  const packSizes = await prisma.packSize.findMany({ orderBy: { name: 'asc' } });
  return NextResponse.json(packSizes);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const data = createSchema.parse(body);
  const packSize = await prisma.packSize.create({ data });
  return NextResponse.json(packSize, { status: 201 });
}
