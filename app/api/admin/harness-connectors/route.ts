import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET /api/admin/harness-connectors?productId=xxx — list connectors for a product */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'HARNESS_PRODUCTION');
    const productId = req.nextUrl.searchParams.get('productId');
    if (!productId) return NextResponse.json({ error: 'productId required' }, { status: 400 });

    const connectors = await prisma.harnessConnector.findMany({
      where: { productId, active: true },
      orderBy: { sortOrder: 'asc' },
    });
    return NextResponse.json(connectors);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[harness-connectors GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/admin/harness-connectors — create a new connector for a product */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');
    const { productId, name, description, sortOrder } = await req.json();
    if (!productId || !name?.trim())
      return NextResponse.json({ error: 'productId and name required' }, { status: 400 });

    const connector = await prisma.harnessConnector.create({
      data: {
        productId,
        name: name.trim(),
        description: description?.trim() || undefined,
        sortOrder: sortOrder ?? 0,
      },
    });
    return NextResponse.json(connector, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[harness-connectors POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
