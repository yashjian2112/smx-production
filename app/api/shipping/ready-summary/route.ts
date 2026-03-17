import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET /api/shipping/ready-summary
 *  Read-only — accessible to ALL authenticated roles.
 *  Returns orders that have at least 1 unit at FINAL_ASSEMBLY + APPROVED + not yet dispatched.
 */
export async function GET() {
  try {
    await requireSession();

    // Find orders with at least 1 ready unit AND no active dispatch order
    const orders = await prisma.order.findMany({
      where: {
        // No active (OPEN / PACKING / SUBMITTED) dispatch order for this order
        dispatchOrders: {
          none: {
            status: { in: ['OPEN', 'PACKING', 'SUBMITTED'] },
          },
        },
        units: {
          some: {
            currentStage: 'FINAL_ASSEMBLY',
            currentStatus: 'APPROVED',
            readyForDispatch: false,
            packingBoxItem: null,  // not yet assigned to any box
          },
        },
      },
      include: {
        client: { select: { customerName: true } },
        product: { select: { code: true, name: true } },
        units: {
          where: {
            currentStage: 'FINAL_ASSEMBLY',
            currentStatus: 'APPROVED',
            readyForDispatch: false,
            packingBoxItem: null,  // not yet assigned to any box
          },
          select: { id: true, serialNumber: true },
          orderBy: { serialNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      quantity: o.quantity,
      readyCount: o.units.length,
      client: o.client ? { customerName: o.client.customerName } : null,
      product: { code: o.product.code, name: o.product.name },
      units: o.units.map((u) => ({ id: u.id, serialNumber: u.serialNumber })),
    }));

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
