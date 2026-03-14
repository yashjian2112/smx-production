import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createSchema = z.object({ orderId: z.string().min(1) });

/** Generate next dispatch number: TSM/DS/YY-YY/NNN */
async function nextDispatchNumber(): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const fy = m >= 4 ? y : y - 1;      // financial year start
  const prefix = `TSM/DS/${String(fy).slice(-2)}-${String(fy + 1).slice(-2)}/`;

  const last = await prisma.dispatch.findFirst({
    where:   { dispatchNumber: { startsWith: prefix } },
    orderBy: { dispatchNumber: 'desc' },
    select:  { dispatchNumber: true },
  });

  const seq = last
    ? parseInt(last.dispatchNumber.split('/').pop() ?? '0', 10) + 1
    : 1;

  return `${prefix}${String(seq).padStart(3, '0')}`;
}

/**
 * POST /api/shipping/dispatch
 * Create a new DRAFT dispatch for an order.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'ACCOUNTS', 'SHIPPING');

    const body = createSchema.parse(await req.json());

    // Verify order exists
    const order = await prisma.order.findUnique({
      where:  { id: body.orderId },
      select: { id: true, orderNumber: true, status: true },
    });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Check no existing DRAFT for this order
    const existing = await prisma.dispatch.findFirst({
      where: { orderId: body.orderId, status: 'DRAFT' },
      select: { id: true, dispatchNumber: true },
    });
    if (existing) {
      return NextResponse.json({ dispatch: existing, alreadyExists: true });
    }

    const dispatchNumber = await nextDispatchNumber();
    const dispatch = await prisma.dispatch.create({
      data: {
        dispatchNumber,
        orderId:        body.orderId,
        dispatchedById: session.id,
      },
      include: {
        items: true,
        order: {
          select: {
            orderNumber: true,
            quantity:    true,
            client: { select: { customerName: true, shippingAddress: true, billingAddress: true } },
            product: { select: { code: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json({ dispatch }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
