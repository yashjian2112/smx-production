import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/purchase/vendor-categories — list all vendor categories
export async function GET() {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTS'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cats = await prisma.vendorCategory.findMany({
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(cats);
}

// POST /api/purchase/vendor-categories — create a vendor category
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: 'Category name required' }, { status: 400 });

  const existing = await prisma.vendorCategory.findUnique({ where: { name: name.trim() } });
  if (existing) return NextResponse.json({ error: 'Category already exists' }, { status: 409 });

  const cat = await prisma.vendorCategory.create({
    data: { name: name.trim(), description: description?.trim() ?? null },
  });
  return NextResponse.json(cat, { status: 201 });
}

// DELETE /api/purchase/vendor-categories — delete a vendor category by name
export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: 'Category name required' }, { status: 400 });

  await prisma.vendorCategory.delete({ where: { name } });
  return NextResponse.json({ ok: true });
}
