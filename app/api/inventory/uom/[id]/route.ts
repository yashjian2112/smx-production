import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'INVENTORY_MANAGER'] as const;

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  await prisma.unitOfMeasure.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
