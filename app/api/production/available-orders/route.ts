import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/production/available-orders
// Returns orders that have units in PENDING status and no job card accepted yet for that stage.
// Production employees see all available work in the queue.
export async function GET() {
  const session = await requireSession();
  if (!['PRODUCTION_EMPLOYEE', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Find all units that are PENDING (not yet started by anyone)
  // Includes both manufactured and trading items
  const pendingUnits = await prisma.controllerUnit.findMany({
    where: { currentStatus: 'PENDING' },
    include: {
      product: { select: { productType: true } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          quantity: true,
          status: true,
          dueDate: true,
          voltage: true,
          product: { select: { id: true, name: true, code: true, productType: true } },
        }
      }
    }
  });

  // Group by orderId
  const orderMap: Record<string, {
    orderId: string;
    orderNumber: string;
    quantity: number;
    dueDate: string | null;
    voltage: string | null;
    product: { id: string; name: string; code: string; productType: string };
    pendingUnitCount: number;
    stage: string;
    isTrading: boolean;
  }> = {};

  for (const unit of pendingUnits) {
    const { order } = unit;
    const isTrading = (unit.product?.productType ?? order.product.productType) === 'TRADING';

    if (!orderMap[order.id]) {
      let stage: string;
      if (isTrading) {
        // Trading items are always at FINAL_ASSEMBLY
        stage = 'FINAL_ASSEMBLY';
      } else {
        // Determine what stage these units are at (check existing assignments for this order)
        const jobCard = await prisma.jobCard.findFirst({
          where: { orderId: order.id },
          orderBy: { createdAt: 'desc' },
          select: { stage: true, status: true }
        });
        stage = jobCard?.stage ?? 'POWERSTAGE_MANUFACTURING';
      }

      orderMap[order.id] = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        quantity: order.quantity,
        dueDate: order.dueDate ? order.dueDate.toISOString() : null,
        voltage: order.voltage,
        product: { ...order.product, productType: order.product.productType ?? 'MANUFACTURED' },
        pendingUnitCount: 0,
        stage,
        isTrading,
      };
    }
    orderMap[order.id].pendingUnitCount++;
  }

  // Check if employee already has a job card for each order (meaning they accepted it)
  const myJobCards = await prisma.jobCard.findMany({
    where: { createdById: session.id },
    select: { id: true, orderId: true, stage: true, status: true }
  });
  const myJobCardKeys = new Set(myJobCards.map(jc => `${jc.orderId}:${jc.stage}`));

  // Filter out orders already accepted and in progress
  const result = Object.values(orderMap)
    .map(order => {
      // Trading orders: they show in Pending as long as units are PENDING
      // Once accepted (units set to IN_PROGRESS), they won't appear here anymore
      if (order.isTrading) {
        return { ...order, alreadyAccepted: false, myJobCard: null };
      }
      const accepted = myJobCardKeys.has(`${order.orderId}:${order.stage}`);
      const jc = myJobCards.find(jc => jc.orderId === order.orderId) ?? null;
      return { ...order, alreadyAccepted: accepted, myJobCard: jc };
    })
    .filter(order => {
      // Trading: always show (they only have PENDING units here by definition)
      if (order.isTrading) return true;
      // Manufactured: hide if accepted and materials dispatched/in-progress
      if (order.alreadyAccepted && order.myJobCard?.status && ['DISPATCHED', 'COMPLETED', 'IN_PROGRESS'].includes(order.myJobCard.status)) return false;
      return true;
    });

  return NextResponse.json(result);
}
