import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/admin/qc-tests?productId=xxx
// Returns QC test items with their params for a product
export async function GET(req: NextRequest) {
  const session = await requireSession();
  requireRole(session, 'ADMIN', 'QC_USER', 'PRODUCTION_MANAGER');

  const productId = req.nextUrl.searchParams.get('productId');
  if (!productId) {
    return NextResponse.json({ error: 'productId required' }, { status: 400 });
  }

  const items = await prisma.qCTestItem.findMany({
    where: { productId, active: true },
    include: { params: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { sortOrder: 'asc' },
  });

  return NextResponse.json(items);
}

// POST /api/admin/qc-tests
// Body: { productId, name, sortOrder?, requirePhoto?, aiExtract?, params: [...] }
// Creates a QC test item with its parameters in one go
export async function POST(req: NextRequest) {
  const session = await requireSession();
  requireRole(session, 'ADMIN');

  const body = await req.json();
  const { productId, name, sortOrder, requirePhoto, aiExtract, params } = body;

  if (!productId || !name) {
    return NextResponse.json({ error: 'productId and name required' }, { status: 400 });
  }

  const item = await prisma.qCTestItem.create({
    data: {
      productId,
      name,
      sortOrder: sortOrder ?? 0,
      requirePhoto: requirePhoto ?? false,
      aiExtract: aiExtract ?? false,
      params: {
        create: (params ?? []).map((p: Record<string, unknown>, i: number) => ({
          name: p.name as string,
          label: (p.label as string) || null,
          unit: (p.unit as string) || null,
          minValue: p.minValue != null ? Number(p.minValue) : null,
          maxValue: p.maxValue != null ? Number(p.maxValue) : null,
          matchTolerance: p.matchTolerance != null ? Number(p.matchTolerance) : null,
          matchParamId: (p.matchParamId as string) || null,
          isWriteParam: (p.isWriteParam as boolean) ?? false,
          hardBlock: (p.hardBlock as boolean) ?? false,
          sortOrder: (p.sortOrder as number) ?? i,
        })),
      },
    },
    include: { params: { orderBy: { sortOrder: 'asc' } } },
  });

  return NextResponse.json(item, { status: 201 });
}
