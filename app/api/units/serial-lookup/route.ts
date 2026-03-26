import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const session = await requireSession();
  if (!['ADMIN', 'SALES', 'ACCOUNTS', 'PRODUCTION_EMPLOYEE'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const serial = searchParams.get('serial')?.trim();

  if (!serial) {
    return NextResponse.json({ error: 'serial parameter is required' }, { status: 400 });
  }

  const unit = await prisma.controllerUnit.findFirst({
    where: { serialNumber: serial },
    select: {
      id:           true,
      serialNumber: true,
      orderId:      true,
      order: {
        select: {
          id:          true,
          orderNumber: true,
          clientId:    true,
          productId:   true,
          client: {
            select: { id: true, code: true, customerName: true },
          },
          product: {
            select: { id: true, name: true, code: true },
          },
        },
      },
    },
  });

  if (!unit) {
    return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
  }

  return NextResponse.json({
    unitId:      unit.id,
    orderId:     unit.orderId,
    serialNumber: unit.serialNumber,
    orderNumber:  unit.order?.orderNumber ?? null,
    client: unit.order?.client
      ? { id: unit.order.client.id, code: unit.order.client.code, customerName: unit.order.client.customerName }
      : null,
    product: unit.order?.product
      ? { id: unit.order.product.id, code: unit.order.product.code, name: unit.order.product.name }
      : null,
  });
}
