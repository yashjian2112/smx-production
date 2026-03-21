import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'INVENTORY_MANAGER'] as const;

const schema = z.object({
  name:   z.string().min(1),
  symbol: z.string().min(1).max(8).transform(s => s.toUpperCase()),
  type:   z.enum(['QUANTITY', 'WEIGHT', 'VOLUME', 'LENGTH']).default('QUANTITY'),
});

export async function GET() {
  await requireSession();
  const units = await prisma.unitOfMeasure.findMany({ orderBy: { symbol: 'asc' } });
  return NextResponse.json(units);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = schema.parse(body);

  const existing = await prisma.unitOfMeasure.findUnique({ where: { symbol: data.symbol } });
  if (existing) return NextResponse.json({ error: `Unit "${data.symbol}" already exists` }, { status: 409 });

  const unit = await prisma.unitOfMeasure.create({ data });
  return NextResponse.json(unit, { status: 201 });
}
