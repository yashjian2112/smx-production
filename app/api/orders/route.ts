import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole, isManager } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextSerial } from '@/lib/serial';
import { generateNextPowerstageBarcode, generateNextBrainboardBarcode, generateNextQCBarcode } from '@/lib/barcode';
import { StageType } from '@prisma/client';
import { z } from 'zod';

const createSchema = z.object({
  orderNumber:        z.string().min(1),
  websiteOrderNumber: z.string().optional(),
  clientId:           z.string().optional(),
  productId:          z.string().min(1),
  quantity:           z.number().int().min(1).max(10000),
  dueDate:            z.string().datetime().optional(),
  priority:           z.number().int().optional(),
  voltage:            z.string().optional(),
  motorType:          z.enum(['LBX', 'UBX']).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const validStatuses = ['ACTIVE', 'HOLD', 'CANCELLED', 'CLOSED', 'DISPATCHED'];
    const orders = await prisma.order.findMany({
      where: (status && validStatuses.includes(status)) ? { status: status as 'ACTIVE' | 'HOLD' | 'CANCELLED' | 'CLOSED' | 'DISPATCHED' } : {},
      include: {
        product: true,
        _count: { select: { units: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json(orders);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }
    const { orderNumber, websiteOrderNumber, clientId, productId, quantity, dueDate, priority, voltage, motorType } = parsed.data;

    // Prevent duplicate order numbers
    const existing = await prisma.order.findFirst({ where: { orderNumber } });
    if (existing) return NextResponse.json({ error: `Order number "${orderNumber}" already exists` }, { status: 400 });

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 400 });

    const order = await prisma.order.create({
      data: {
        orderNumber,
        websiteOrderNumber: websiteOrderNumber ?? null,
        clientId: clientId ?? null,
        productId,
        quantity,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority ?? 0,
        voltage: voltage ?? null,
        motorType: motorType ?? null,
        createdById: session.id,
      },
      include: { product: true },
    });

    await appendTimeline({
      orderId: order.id,
      userId: session.id,
      action: 'order_created',
      remarks: `Order ${orderNumber}${websiteOrderNumber ? ` (Web: ${websiteOrderNumber})` : ''}, qty ${quantity}`,
    });

    // Generate unit records with serial + early-stage barcodes.
    // Final Assembly barcode is generated when the unit actually reaches Final Assembly
    // so the month-batch code matches the real build month.
    for (let i = 0; i < quantity; i++) {
      const serial = await generateNextSerial(product.code);
      const powerstageBarcode = await generateNextPowerstageBarcode(product.code);
      const brainboardBarcode = await generateNextBrainboardBarcode(product.code);
      const qcBarcode = await generateNextQCBarcode(product.code);
      await prisma.controllerUnit.create({
        data: {
          serialNumber: serial,
          orderId: order.id,
          productId: product.id,
          currentStage: StageType.POWERSTAGE_MANUFACTURING,
          currentStatus: 'PENDING',
          powerstageBarcode,
          brainboardBarcode,
          qcBarcode,
        },
      });
    }

    const createdUnits = await prisma.controllerUnit.findMany({
      where: { orderId: order.id },
      orderBy: { serialNumber: 'asc' },
    });
    for (const u of createdUnits) {
      await appendTimeline({
        unitId: u.id,
        orderId: order.id,
        userId: session.id,
        action: 'serial_generated',
        stage: u.currentStage,
        remarks: u.serialNumber,
      });
    }

    const updated = await prisma.order.findUnique({
      where: { id: order.id },
      include: { product: true, units: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
