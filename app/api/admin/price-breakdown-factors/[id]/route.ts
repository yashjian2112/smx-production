import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH — update factor
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const data = await req.json();
  const factor = await prisma.priceBreakdownFactor.update({
    where: { id },
    data: {
      name:        data.name        ?? undefined,
      description: data.description ?? undefined,
      category:    data.category    !== undefined ? (data.category?.trim() || null) : undefined,
      isRequired:  data.isRequired  ?? undefined,
      order:       data.order       ?? undefined,
      active:      data.active      ?? undefined,
    },
  });
  return NextResponse.json(factor);
}

// DELETE — soft-delete (set active=false)
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  await prisma.priceBreakdownFactor.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
