import { NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/shipping/orders
 * Returns all orders that have at least one controller ready for shipping.
 * "Ready" = FINAL_ASSEMBLY stage, COMPLETED or APPROVED status, readyForDispatch=false,
 *           and NOT already in a DRAFT or SUBMITTED dispatch item.
 */
export async function GET() {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'ACCOUNTS');

    // Find unit IDs already locked in active dispatches (DRAFT or SUBMITTED)
    const activeItems = await prisma.dispatchItem.findMany({
      where: { dispatch: { status: { in: ['DRAFT', 'SUBMITTED'] } } },
      select: { unitId: true },
    });
    const lockedUnitIds = new Set(activeItems.map((i) => i.unitId));

    // Find all units ready to ship
    const readyUnits = await prisma.controllerUnit.findMany({
      where: {
        currentStage:    'FINAL_ASSEMBLY',
        currentStatus:   { in: ['COMPLETED', 'APPROVED'] },
        readyForDispatch: false,
      },
      select: {
        id:                  true,
        serialNumber:        true,
        finalAssemblyBarcode: true,
        currentStatus:       true,
        orderId:             true,
        order: {
          select: {
            id:          true,
            orderNumber: true,
            quantity:    true,
            status:      true,
            client: { select: { id: true, code: true, customerName: true } },
            product: { select: { id: true, code: true, name: true } },
            dispatches: {
              where: { status: { in: ['DRAFT', 'SUBMITTED'] } },
              select: { id: true, dispatchNumber: true, status: true },
              take: 1,
            },
          },
        },
      },
    });

    // Filter out locked units and group by order
    const orderMap = new Map<string, {
      orderId:       string;
      orderNumber:   string;
      quantity:      number;
      orderStatus:   string;
      client:        { id: string; code: string; customerName: string } | null;
      product:       { id: string; code: string; name: string };
      activeDraft:   { id: string; dispatchNumber: string; status: string } | null;
      readyUnits:    { id: string; serialNumber: string; finalAssemblyBarcode: string | null; currentStatus: string }[];
    }>();

    for (const unit of readyUnits) {
      if (lockedUnitIds.has(unit.id)) continue;
      const o = unit.order;
      if (!orderMap.has(o.id)) {
        orderMap.set(o.id, {
          orderId:     o.id,
          orderNumber: o.orderNumber,
          quantity:    o.quantity,
          orderStatus: o.status,
          client:      o.client ?? null,
          product:     o.product,
          activeDraft: o.dispatches[0] ?? null,
          readyUnits:  [],
        });
      }
      orderMap.get(o.id)!.readyUnits.push({
        id:                   unit.id,
        serialNumber:         unit.serialNumber,
        finalAssemblyBarcode: unit.finalAssemblyBarcode,
        currentStatus:        unit.currentStatus,
      });
    }

    // Also include orders that have an active DRAFT/SUBMITTED dispatch (even if no more free units)
    const activeDispatches = await prisma.dispatch.findMany({
      where: { status: { in: ['DRAFT', 'SUBMITTED'] } },
      select: {
        id:             true,
        dispatchNumber: true,
        status:         true,
        orderId:        true,
        order: {
          select: {
            id:          true,
            orderNumber: true,
            quantity:    true,
            status:      true,
            client: { select: { id: true, code: true, customerName: true } },
            product: { select: { id: true, code: true, name: true } },
          },
        },
        _count: { select: { items: true } },
      },
    });

    for (const d of activeDispatches) {
      if (!orderMap.has(d.orderId)) {
        orderMap.set(d.orderId, {
          orderId:     d.order.id,
          orderNumber: d.order.orderNumber,
          quantity:    d.order.quantity,
          orderStatus: d.order.status,
          client:      d.order.client ?? null,
          product:     d.order.product,
          activeDraft: { id: d.id, dispatchNumber: d.dispatchNumber, status: d.status },
          readyUnits:  [],
        });
      } else {
        // Update activeDraft if missing
        const entry = orderMap.get(d.orderId)!;
        if (!entry.activeDraft) {
          entry.activeDraft = { id: d.id, dispatchNumber: d.dispatchNumber, status: d.status };
        }
      }
    }

    // Count total dispatched for each order
    const orderIds = Array.from(orderMap.keys());
    const dispatchedCounts = await prisma.dispatchItem.groupBy({
      by: ['dispatchId'],
      where: {
        dispatch: {
          orderId: { in: orderIds },
          status:  'APPROVED',
        },
      },
      _count: { id: true },
    });

    // Build dispatched per order
    const dispatchedByOrder: Record<string, number> = {};
    for (const grp of dispatchedCounts) {
      const d = await prisma.dispatch.findUnique({ where: { id: grp.dispatchId }, select: { orderId: true } });
      if (d) {
        dispatchedByOrder[d.orderId] = (dispatchedByOrder[d.orderId] ?? 0) + grp._count.id;
      }
    }

    const orders = Array.from(orderMap.values()).map((o) => ({
      ...o,
      dispatchedCount: dispatchedByOrder[o.orderId] ?? 0,
    }));

    return NextResponse.json({ orders });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
