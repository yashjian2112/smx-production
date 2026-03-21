import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// STORE_MANAGER and INVENTORY_MANAGER can view categories
const VIEW_ROLES    = ['ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER', 'INVENTORY_MANAGER'] as const;
const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'] as const;

const createSchema = z.object({
  name:        z.string().min(1),
  description: z.string().optional(),
});

export async function GET() {
  const session = await requireSession();
  if (!VIEW_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const categories = await prisma.materialCategory.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { materials: true } } },
  });

  return NextResponse.json(categories);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = createSchema.parse(body);

  const category = await prisma.materialCategory.create({
    data,
    include: { _count: { select: { materials: true } } },
  });

  return NextResponse.json(category, { status: 201 });
}
