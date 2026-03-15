import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS', 'SALES', 'PRODUCTION_MANAGER');

    const invoices = await prisma.invoice.findMany({
      include: {
        client: { select: { customerName: true, globalOrIndian: true } },
        dispatchOrder: {
          select: {
            doNumber: true,
            order: { select: { orderNumber: true } },
          },
        },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json(invoices);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
