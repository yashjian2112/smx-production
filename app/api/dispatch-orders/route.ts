import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextDONumber } from '@/lib/invoice-number';
import { DOStatus } from '@prisma/client';
import { z } from 'zod';

const createSchema = z.object({
  orderId:     z.string().min(1),
  dispatchQty: z.number().int().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS', 'SHIPPING', 'PACKING');

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status');

    let statusFilter: DOStatus[] | undefined;
    if (statusParam) {
      statusFilter = statusParam.split(',').map((s) => s.trim() as DOStatus);
    }

    const dispatchOrders = await prisma.dispatchOrder.findMany({
      where: statusFilter ? { status: { in: statusFilter } } : {},
      include: {
        order: {
          select: {
            orderNumber: true,
            quantity: true,
            client: { select: { customerName: true, globalOrIndian: true } },
            product: { select: { code: true, name: true } },
          },
        },
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        boxes: {
          select: {
            _count: { select: { items: true } },
          },
        },
        invoices: {
          select: { id: true, invoiceNumber: true, notes: true },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json(dispatchOrders);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_EMPLOYEE', 'SHIPPING');

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { orderId, dispatchQty } = parsed.data;

    // Order must exist and be ACTIVE
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        units: {
          where: {
            currentStage:     'FINAL_ASSEMBLY',
            currentStatus:    { in: ['APPROVED', 'COMPLETED'] },
            readyForDispatch: false,
            packingBoxItem:   null, // exclude units already packed in other DOs
          },
          select: { id: true },
        },
      },
    });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (order.status !== 'ACTIVE')
      return NextResponse.json({ error: 'Order must be ACTIVE to create a dispatch order' }, { status: 400 });
    if (order.units.length === 0)
      return NextResponse.json(
        { error: 'Order must have at least 1 unit in FINAL_ASSEMBLY with status APPROVED and not yet dispatched' },
        { status: 400 }
      );
    if (dispatchQty > order.units.length)
      return NextResponse.json(
        { error: `Dispatch quantity (${dispatchQty}) exceeds ready units (${order.units.length})` },
        { status: 400 }
      );

    // Allow multiple DOs per order (partial dispatch support)
    const doNumber = await generateNextDONumber();

    const dispatchOrder = await prisma.dispatchOrder.create({
      data: {
        doNumber,
        orderId,
        dispatchQty,
        status: 'OPEN',
        createdById: session.id,
      },
      include: {
        order: {
          select: {
            orderNumber: true,
            quantity: true,
            client: { select: { customerName: true, globalOrIndian: true } },
            product: { select: { code: true, name: true } },
          },
        },
        createdBy: { select: { name: true } },
        boxes: true,
      },
    });

    return NextResponse.json(dispatchOrder, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
