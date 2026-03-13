import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifySheetToken } from '@/lib/sheet-auth';

export async function GET(req: NextRequest) {
  if (!verifySheetToken(req)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since');

  // Default: last 90 days
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const units = await prisma.controllerUnit.findMany({
    where: {
      readyForDispatch: true,
    },
    include: {
      product:      { select: { name: true, code: true } },
      order:        { select: { orderNumber: true, quantity: true } },
      timelineLogs: {
        where:   { action: 'dispatched' },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take:    1,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Filter by dispatch date (from timeline log)
  const results = units
    .map((u) => {
      const dispatchLog = u.timelineLogs[0];
      if (!dispatchLog) return null;
      if (dispatchLog.createdAt < sinceDate) return null;

      return {
        workOrderNumber:      u.order?.orderNumber ?? '',
        serialNumber:         u.serialNumber,
        productName:          u.product?.name ?? '',
        productCode:          u.product?.code ?? '',
        finalAssemblyBarcode: u.finalAssemblyBarcode ?? '',
        orderedQty:           u.order?.quantity ?? 1,
        qtyDispatched:        1,
        dispatchedAt:         dispatchLog.createdAt.toISOString(),
        dispatchedBy:         dispatchLog.user?.name ?? '',
      };
    })
    .filter(Boolean);

  return NextResponse.json({ ok: true, count: results.length, dispatched: results });
}
