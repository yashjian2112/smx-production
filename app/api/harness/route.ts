import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/harness — list harness units
 * Query params: status (comma-separated), orderId
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'HARNESS_PRODUCTION');
    const statusParam = req.nextUrl.searchParams.get('status');
    const orderId = req.nextUrl.searchParams.get('orderId');

    const where: Record<string, unknown> = {};
    if (statusParam) {
      const statuses = statusParam.split(',').map(s => s.trim());
      where.status = { in: statuses };
    }
    if (orderId) where.orderId = orderId;

    const units = await prisma.harnessUnit.findMany({
      where,
      include: {
        order: { select: { id: true, orderNumber: true, clientId: true, quantity: true } },
        product: { select: { id: true, code: true, name: true } },
        assignedUser: { select: { id: true, name: true } },
        pairedController: { select: { id: true, serialNumber: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(units);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[harness GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
