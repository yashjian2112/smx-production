import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';

// POST /api/orders/[id]/accept-trading
// Employee accepts a trading order — sets trading units from PENDING to IN_PROGRESS
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireSession();
  if (!['PRODUCTION_EMPLOYEE', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: orderId } = params;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      product: { select: { productType: true } },
      units: {
        where: { currentStatus: 'PENDING' },
        include: { product: { select: { productType: true } } },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // Only trading units that are PENDING
  const tradingUnits = order.units.filter(
    (u) => (u.product?.productType ?? order.product.productType) === 'TRADING'
  );

  if (tradingUnits.length === 0) {
    return NextResponse.json({ error: 'No pending trading units to accept' }, { status: 400 });
  }

  // Update all pending trading units to IN_PROGRESS
  await prisma.controllerUnit.updateMany({
    where: {
      id: { in: tradingUnits.map((u) => u.id) },
      currentStatus: 'PENDING',
    },
    data: { currentStatus: 'IN_PROGRESS' },
  });

  // Add timeline entry for each unit
  for (const unit of tradingUnits) {
    await appendTimeline({
      unitId: unit.id,
      orderId,
      userId: session.id,
      action: 'stage_started',
      stage: 'FINAL_ASSEMBLY',
      statusFrom: 'PENDING',
      statusTo: 'IN_PROGRESS',
      remarks: 'Trading order accepted by employee',
    });
  }

  return NextResponse.json({ accepted: tradingUnits.length });
}
