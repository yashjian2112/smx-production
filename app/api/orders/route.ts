import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole, isManager } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextSerial } from '@/lib/serial';
import { generateNextPowerstageBarcode, generateNextBrainboardBarcode, generateNextQCBarcode, generateNextFinalAssemblyBarcode } from '@/lib/barcode';
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
    requireRole(session, 'ADMIN', 'SALES', 'ACCOUNTS', 'PACKING', 'PRODUCTION_EMPLOYEE', 'QC_USER', 'PRODUCTION_MANAGER');
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');

    const orders = await prisma.order.findMany({
      where: status ? { status: status as 'ACTIVE' | 'HOLD' | 'CANCELLED' | 'CLOSED' } : {},
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
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

    const isTrading = product.productType === 'TRADING';

    if (isTrading) {
      // ── TRADING ITEMS: units start at FINAL_ASSEMBLY / APPROVED (ready for dispatch) ──
      for (let i = 0; i < quantity; i++) {
        const serial = await generateNextSerial(product.code);
        const finalAssemblyBarcode = await generateNextFinalAssemblyBarcode(product.code);

        const unit = await prisma.controllerUnit.create({
          data: {
            serialNumber: serial,
            orderId: order.id,
            productId: product.id,
            currentStage: StageType.FINAL_ASSEMBLY,
            currentStatus: 'APPROVED',
            readyForDispatch: false,
            finalAssemblyBarcode,
          },
        });

        await appendTimeline({
          unitId: unit.id,
          orderId: order.id,
          userId: session.id,
          action: 'serial_generated',
          stage: StageType.FINAL_ASSEMBLY,
          remarks: `${serial} (trading item — ready for dispatch)`,
        });
      }
    } else {
      // ── MANUFACTURED ITEMS: units start at POWERSTAGE / PENDING (normal flow) ──
      // Try to allocate PS and BB barcodes from MaterialSerial inventory
      const availablePS = await prisma.materialSerial.findMany({
        where: { stageType: 'PS', status: 'CONFIRMED' },
        orderBy: { createdAt: 'asc' },
        take: quantity,
      });
      const availableBB = await prisma.materialSerial.findMany({
        where: { stageType: 'BB', status: 'CONFIRMED' },
        orderBy: { createdAt: 'asc' },
        take: quantity,
      });
      const useInventoryPS = availablePS.length >= quantity;
      const useInventoryBB = availableBB.length >= quantity;

      for (let i = 0; i < quantity; i++) {
        const serial = await generateNextSerial(product.code);
        const qcBarcode = await generateNextQCBarcode(product.code);

        let powerstageBarcode: string;
        let brainboardBarcode: string;

        if (useInventoryPS) {
          powerstageBarcode = availablePS[i].barcode;
        } else {
          powerstageBarcode = await generateNextPowerstageBarcode(product.code);
        }

        if (useInventoryBB) {
          brainboardBarcode = availableBB[i].barcode;
        } else {
          brainboardBarcode = await generateNextBrainboardBarcode(product.code);
        }

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

      // Mark allocated MaterialSerials
      if (useInventoryPS) {
        await prisma.materialSerial.updateMany({
          where: { id: { in: availablePS.slice(0, quantity).map(s => s.id) } },
          data: { status: 'ALLOCATED', allocatedToOrderId: order.id },
        });
      }
      if (useInventoryBB) {
        await prisma.materialSerial.updateMany({
          where: { id: { in: availableBB.slice(0, quantity).map(s => s.id) } },
          data: { status: 'ALLOCATED', allocatedToOrderId: order.id },
        });
      }
    }

    const createdUnits = await prisma.controllerUnit.findMany({
      where: { orderId: order.id },
      orderBy: { serialNumber: 'asc' },
    });
    if (!isTrading) {
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
    }

    const updated = await prisma.order.findUnique({
      where: { id: order.id },
      include: { product: true, units: true },
    });
    return NextResponse.json(updated, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
