import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Lightweight material search for rework material requests
export async function GET(req: Request) {
  const session = await requireSession();
  if (!['ADMIN', 'PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER', 'STORE_MANAGER', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';

  const materials = await prisma.rawMaterial.findMany({
    where: {
      active: true,
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
    },
    select: {
      id:           true,
      code:         true,
      name:         true,
      unit:         true,
      currentStock: true,
      minimumStock: true,
    },
    orderBy: { name: 'asc' },
    take: 30,
  });

  return NextResponse.json(materials);
}
