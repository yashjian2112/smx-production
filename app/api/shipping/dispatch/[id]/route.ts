import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const dispatchInclude = {
  items: {
    include: {
      unit:     { select: { id: true, serialNumber: true, finalAssemblyBarcode: true } },
      scannedBy: { select: { id: true, name: true } },
    },
    orderBy: { scannedAt: 'asc' as const },
  },
  order: {
    select: {
      id:          true,
      orderNumber: true,
      quantity:    true,
      client: {
        select: {
          id:              true,
          customerName:    true,
          shippingAddress: true,
          billingAddress:  true,
          gstNumber:       true,
          state:           true,
          globalOrIndian:  true,
        },
      },
      product: { select: { id: true, code: true, name: true } },
    },
  },
  dispatchedBy: { select: { id: true, name: true } },
  approvedBy:   { select: { id: true, name: true } },
} as const;

/** GET /api/shipping/dispatch/[id] — fetch dispatch with all items */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS', 'SHIPPING');

    const dispatch = await prisma.dispatch.findUnique({
      where:   { id: params.id },
      include: dispatchInclude,
    });
    if (!dispatch) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ dispatch });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/shipping/dispatch/[id] — abandon a DRAFT dispatch */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS', 'SHIPPING');

    const dispatch = await prisma.dispatch.findUnique({
      where:  { id: params.id },
      select: { id: true, status: true, dispatchedById: true },
    });
    if (!dispatch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (dispatch.status !== 'DRAFT')
      return NextResponse.json({ error: 'Only DRAFT dispatches can be abandoned' }, { status: 400 });

    // BUG#7 FIX: only the creator or ADMIN can abandon
    if (dispatch.dispatchedById !== session.id && session.role !== 'ADMIN')
      return NextResponse.json({ error: 'Only the dispatcher or an admin can abandon this dispatch' }, { status: 403 });

    await prisma.dispatch.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
