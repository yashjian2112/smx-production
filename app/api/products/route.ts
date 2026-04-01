import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export async function GET() {
  try {
    await requireSession();
    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json(products);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const createSchema = z.object({
  code: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/, 'Product code must be alphanumeric only (e.g. CL350) — no spaces or special characters'),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  productType: z.enum(['MANUFACTURED', 'TRADING']).default('MANUFACTURED'),
  hsnCode: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { code, name, description, productType } = parsed.data;

    const existing = await prisma.product.findUnique({ where: { code } });
    if (existing)
      return NextResponse.json({ error: 'Product code already exists' }, { status: 400 });

    const { hsnCode } = parsed.data;
    const product = await prisma.product.create({
      data: { code, name, description: description ?? null, productType, hsnCode: hsnCode ?? null },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
