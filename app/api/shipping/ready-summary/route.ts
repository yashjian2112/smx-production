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
        units: {
          some: {
            currentStage:     'FINAL_ASSEMBLY',
            currentStatus:    { in: ['APPROVED', 'COMPLETED'] },
            readyForDispatch: false,
            packingBoxItem:   null, // not yet assigned to any box
          },
        },
      },
      include: {
        client: { select: { customerName: true } },
        product: { select: { code: true, name: true } },
        units: {
          where: {
            currentStage:     'FINAL_ASSEMBLY',
            currentStatus:    { in: ['APPROVED', 'COMPLETED'] },
            readyForDispatch: false,
            packingBoxItem:   null, // not yet assigned to any box
          },
          select: { id: true, serialNumber: true },
          orderBy: { serialNumber: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // For each order, also fetch dispatch history (DOs that already handled some units)
    const orderIds = orders.map((o) => o.id);
    const dispatchOrders = orderIds.length > 0
      ? await prisma.dispatchOrder.findMany({
          where: { orderId: { in: orderIds } },
          select: {
            id: true,
            doNumber: true,
            status: true,
            dispatchQty: true,
            orderId: true,
            approvedAt: true,
            boxes: {
              select: { _count: { select: { items: true } } },
            },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    // Group DOs by orderId
    const dosByOrder = new Map<string, typeof dispatchOrders>();
    for (const d of dispatchOrders) {
      const arr = dosByOrder.get(d.orderId) ?? [];
      arr.push(d);
      dosByOrder.set(d.orderId, arr);
    }

    const result = orders.map((o) => {
      const dos = dosByOrder.get(o.id) ?? [];
      // Count units already packed/dispatched through other DOs
      const packedCount = dos.reduce((sum, d) =>
        sum + d.boxes.reduce((bs, b) => bs + b._count.items, 0), 0);
      // Subtract units claimed by OPEN/PACKING DOs (not yet packed but reserved)
      const claimedByPendingDOs = dos
        .filter((d) => d.status === 'OPEN' || d.status === 'PACKING')
        .reduce((sum, d) => sum + d.dispatchQty, 0);
      const trueReady = Math.max(0, o.units.length - claimedByPendingDOs);

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        quantity: o.quantity,
        readyCount: trueReady,
        packedCount,
        client: o.client ? { customerName: o.client.customerName } : null,
        product: { code: o.product.code, name: o.product.name },
        units: o.units.map((u) => ({ id: u.id, serialNumber: u.serialNumber })),
        dispatchHistory: dos.map((d) => ({
          id: d.id,
          doNumber: d.doNumber,
          status: d.status,
          dispatchQty: d.dispatchQty,
          packedUnits: d.boxes.reduce((s, b) => s + b._count.items, 0),
          approvedAt: d.approvedAt?.toISOString() ?? null,
        })),
      };
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
