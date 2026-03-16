import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await requireSession();
  if (!['ADMIN', 'SALES', 'ACCOUNTS', 'PRODUCTION_MANAGER', 'PRODUCTION_EMPLOYEE'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get all active orders with their units grouped by stage
  const orders = await prisma.order.findMany({
    where: { status: { in: ['ACTIVE', 'HOLD'] } },
    include: {
      product: { select: { name: true, code: true } },
      client:  { select: { customerName: true } },
      units: {
        select: {
          currentStage:    true,
          currentStatus:   true,
          readyForDispatch: true,
        },
      },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    take: 100,
  });

  const summary = orders.map((order) => {
    const stageMap: Record<string, number> = {
      PS: 0, BB: 0, CA: 0, QC: 0, RW: 0, FA: 0,
    };

    for (const unit of order.units) {
      const stageKey = stageToKey(unit.currentStage);
      if (stageKey) stageMap[stageKey]++;
    }

    const readyForDispatch = order.units.filter((u) => u.readyForDispatch).length;

    return {
      id:              order.id,
      orderNumber:     order.orderNumber,
      productName:     order.product.name,
      clientName:      order.client?.customerName ?? null,
      quantity:        order.quantity,
      status:          order.status,
      stages:          stageMap,
      readyForDispatch,
    };
  });

  return NextResponse.json(summary);
}

function stageToKey(stage: string): string | null {
  switch (stage) {
    case 'POWERSTAGE_MANUFACTURING':  return 'PS';
    case 'BRAINBOARD_MANUFACTURING':  return 'BB';
    case 'CONTROLLER_ASSEMBLY':       return 'CA';
    case 'QC_AND_SOFTWARE':           return 'QC';
    case 'REWORK':                    return 'RW';
    case 'FINAL_ASSEMBLY':            return 'FA';
    default:                          return null;
  }
}
