import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextDONumber } from '@/lib/invoice-number';
import { DOStatus } from '@prisma/client';
import { z } from 'zod';

const createSchema = z.object({
  orderId:          z.string().min(1).optional(),
  returnRequestId:  z.string().min(1).optional(),
  dispatchQty:      z.number().int().min(1),
  reworkUnitPrice:  z.number().positive().optional(),
}).refine(d => d.orderId || d.returnRequestId, {
  message: 'Either orderId or returnRequestId is required',
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

    const { orderId, returnRequestId, dispatchQty, reworkUnitPrice } = parsed.data;

    const doNumber = await generateNextDONumber();

    // ── Return-based dispatch order ──
    if (returnRequestId) {
      const ret = await prisma.returnRequest.findUnique({
        where: { id: returnRequestId },
        select: { id: true, status: true, clientId: true, returnNumber: true },
      });
      if (!ret) return NextResponse.json({ error: 'Return request not found' }, { status: 404 });
      if (!['QC_CHECKED', 'DISPATCHED'].includes(ret.status))
        return NextResponse.json({ error: 'Return must be QC_CHECKED or DISPATCHED to create a dispatch order' }, { status: 400 });

      // Check no existing open DO for this return
      const existingDO = await prisma.dispatchOrder.findFirst({
        where: { returnRequestId, status: { in: ['OPEN', 'PACKING', 'SUBMITTED'] } },
      });
      if (existingDO)
        return NextResponse.json({ error: 'A dispatch order already exists for this return' }, { status: 400 });

      const dispatchOrder = await prisma.dispatchOrder.create({
        data: {
          doNumber,
          returnRequestId,
          dispatchQty,
          reworkUnitPrice: reworkUnitPrice ?? undefined,
          status: 'OPEN',
          createdById: session.id,
        },
        include: {
          returnRequest: { select: { returnNumber: true, client: { select: { customerName: true } } } },
          createdBy: { select: { name: true } },
          boxes: true,
        },
      });

      return NextResponse.json(dispatchOrder, { status: 201 });
    }

    // ── Order-based dispatch order (existing flow) ──
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });

    // Order must exist and be ACTIVE
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        product: { select: { productType: true } },
        units: {
          where: {
            currentStage:     'FINAL_ASSEMBLY',
            currentStatus:    { in: ['APPROVED', 'COMPLETED', 'PENDING'] },
            readyForDispatch: false,
            packingBoxItem:   null, // exclude units already packed in other DOs
          },
          select: { id: true, currentStatus: true, barcodeVerified: true, product: { select: { productType: true } } },
        },
      },
    });
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (order.status !== 'ACTIVE')
      return NextResponse.json({ error: 'Order must be ACTIVE to create a dispatch order' }, { status: 400 });

    const isTrading = order.product.productType === 'TRADING';

    // For manufactured items, only count APPROVED/COMPLETED units
    const availableUnits = isTrading
      ? order.units
      : order.units.filter(u => u.currentStatus === 'APPROVED' || u.currentStatus === 'COMPLETED');

    if (availableUnits.length === 0)
      return NextResponse.json(
        { error: isTrading
          ? 'No units available for dispatch'
          : 'Order must have at least 1 unit in FINAL_ASSEMBLY with status APPROVED and not yet dispatched' },
        { status: 400 }
      );

    // Block dispatch if any trading units are not barcode-verified
    const unverifiedTrading = availableUnits.filter(u => u.product?.productType === 'TRADING' && !u.barcodeVerified);
    if (unverifiedTrading.length > 0) {
      return NextResponse.json(
        { error: `${unverifiedTrading.length} trading unit${unverifiedTrading.length !== 1 ? 's have' : ' has'} not been barcode-verified. Please scan and confirm all trading barcodes before creating a dispatch order.` },
        { status: 400 }
      );
    }
    // Subtract units already claimed by OPEN/PACKING DOs (not yet packed but reserved)
    const pendingDOs = await prisma.dispatchOrder.findMany({
      where: { orderId, status: { in: ['OPEN', 'PACKING'] } },
      select: { dispatchQty: true },
    });
    const claimedQty = pendingDOs.reduce((sum, d) => sum + d.dispatchQty, 0);
    const trueAvailable = availableUnits.length - claimedQty;

    if (trueAvailable <= 0)
      return NextResponse.json(
        { error: 'All available units are already claimed by existing dispatch orders' },
        { status: 400 }
      );
    if (dispatchQty > trueAvailable)
      return NextResponse.json(
        { error: `Dispatch quantity (${dispatchQty}) exceeds available units (${trueAvailable})` },
        { status: 400 }
      );

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

    // For trading items: auto-approve all PENDING units so they become dispatchable
    if (isTrading) {
      const pendingUnitIds = availableUnits.filter(u => u.currentStatus === 'PENDING').map(u => u.id);
      if (pendingUnitIds.length > 0) {
        await prisma.controllerUnit.updateMany({
          where: { id: { in: pendingUnitIds } },
          data: { currentStatus: 'APPROVED' },
        });
      }
    }

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
