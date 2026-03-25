import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET — list all factors (PM, IM, Admin can see; vendor portal fetches via separate endpoint)
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category');
  const factors = await prisma.priceBreakdownFactor.findMany({
    where: {
      active: true,
      ...(category ? { OR: [{ category }, { category: null }] } : {}),
    },
    orderBy: [{ category: 'asc' }, { order: 'asc' }],
    include: { createdBy: { select: { name: true } } },
  });
  return NextResponse.json(factors);
}

// POST — Admin creates a factor
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { name, description, category, isRequired, order } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const factor = await prisma.priceBreakdownFactor.create({
    data: {
      name: name.trim(),
      description: description ?? null,
      category: category?.trim() || null,
      isRequired: isRequired ?? true,
      order: order ?? 0,
      createdById: session.id,
    },
  });
  return NextResponse.json(factor, { status: 201 });
}
