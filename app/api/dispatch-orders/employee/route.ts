import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET /api/dispatch-orders/employee
 *  Read-only endpoint — accessible to ALL authenticated roles.
 *  Returns all dispatch orders (for the dispatch tracker view).
 */
export async function GET() {
  try {
    await requireSession();

    const dispatchOrders = await prisma.dispatchOrder.findMany({
      include: {
        order: {
          select: {
            orderNumber: true,
            quantity: true,
            client: { select: { customerName: true } },
            product: { select: { code: true, name: true } },
          },
        },
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        boxes: {
          select: {
            _count: { select: { items: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json(dispatchOrders);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
