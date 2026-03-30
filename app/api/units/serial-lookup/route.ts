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
      id:                true,
      serialNumber:      true,
      orderId:           true,
      dispatchedAt:      true,
      warrantyStartDate: true,
      warrantyMonths:    true,
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

  // Resolve dispatch date: unit.dispatchedAt → warrantyStartDate
  const dispatchedAt = unit.dispatchedAt ?? unit.warrantyStartDate ?? null;

  // Warranty: use unit.warrantyMonths if set, else default 90 days
  const WARRANTY_DAYS = unit.warrantyMonths ? unit.warrantyMonths * 30 : 90;
  let warrantyStatus: 'in_warranty' | 'out_of_warranty' | 'unknown' = 'unknown';
  let warrantyExpiry: string | null = null;
  let daysSinceDispatch: number | null = null;

  if (dispatchedAt) {
    const dispatchMs = new Date(dispatchedAt).getTime();
    const nowMs      = Date.now();
    daysSinceDispatch = Math.floor((nowMs - dispatchMs) / (1000 * 60 * 60 * 24));
    const expiryDate  = new Date(dispatchMs + WARRANTY_DAYS * 24 * 60 * 60 * 1000);
    warrantyExpiry    = expiryDate.toISOString();
    warrantyStatus    = daysSinceDispatch <= WARRANTY_DAYS ? 'in_warranty' : 'out_of_warranty';
  }

  return NextResponse.json({
    unitId:       unit.id,
    orderId:      unit.orderId,
    serialNumber: unit.serialNumber,
    orderNumber:  unit.order?.orderNumber ?? null,
    client: unit.order?.client
      ? { id: unit.order.client.id, code: unit.order.client.code, customerName: unit.order.client.customerName }
      : null,
    product: unit.order?.product
      ? { id: unit.order.product.id, code: unit.order.product.code, name: unit.order.product.name }
      : null,
    dispatchedAt:      dispatchedAt?.toISOString() ?? null,
    warrantyDays:      WARRANTY_DAYS,
    warrantyExpiry,
    daysSinceDispatch,
    warrantyStatus,
  });
}
