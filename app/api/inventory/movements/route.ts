import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER', 'INVENTORY_MANAGER'] as const;

export async function GET(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const materialId = searchParams.get('materialId');
  const type       = searchParams.get('type');         // IN, OUT, ADJUSTMENT
  const from       = searchParams.get('from');         // ISO date
  const to         = searchParams.get('to');           // ISO date
  const page       = parseInt(searchParams.get('page') || '1');
  const pageSize   = 50;

  const where: any = {};
  if (materialId) where.rawMaterialId = materialId;
  if (type)       where.type = type;
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to)   where.createdAt.lte = new Date(to);
  }

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      include: {
        rawMaterial: { select: { name: true, code: true, unit: true } },
        createdBy:   { select: { name: true } },
      },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return NextResponse.json({ movements, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
}
