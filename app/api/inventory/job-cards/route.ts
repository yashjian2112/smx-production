import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextJobCardNumber } from '@/lib/invoice-number';
import { StageType } from '@prisma/client';

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'PRODUCTION_EMPLOYEE', 'HARNESS_PRODUCTION'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const status  = searchParams.get('status');
  const unitId  = searchParams.get('unitId');
  const stage   = searchParams.get('stage');
  const orderId = searchParams.get('orderId');

  const where: Record<string, unknown> = {};
  if (status)  where.status  = status;
  if (orderId) where.orderId = orderId;
  if (unitId)  where.unitId  = unitId;
  if (stage)   where.stage   = stage;

  const cards = await prisma.jobCard.findMany({
    where,
    include: {
      order: { select: { orderNumber: true, quantity: true } },
      unit: { select: { serialNumber: true } },
      createdBy: { select: { name: true } },
      dispatchedBy: { select: { name: true } },
      items: {
        include: {
          rawMaterial: {
            select: {
              id: true, name: true, code: true, unit: true,
              barcode: true, currentStock: true,
              purchaseUnit: true, conversionFactor: true
            }
          },
          batch: { select: { id: true, batchCode: true, remainingQty: true } },
        }
      }
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(cards);
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['PRODUCTION_EMPLOYEE', 'ADMIN', 'HARNESS_PRODUCTION'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { orderId, stage } = body;

  if (!orderId || !stage) {
    return NextResponse.json({ error: 'orderId and stage are required' }, { status: 400 });
  }

  // Return existing job card if already created for this order+stage
  const existing = await prisma.jobCard.findUnique({
    where: { orderId_stage: { orderId, stage: stage as StageType } },
    include: {
      order: { select: { orderNumber: true, quantity: true } },
      items: {
        include: {
          rawMaterial: {
            select: {
              id: true, name: true, code: true, unit: true,
              barcode: true, currentStock: true,
              purchaseUnit: true, conversionFactor: true
            }
          }
        }
      }
    }
  });
  if (existing) return NextResponse.json(existing);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { product: true },
  });
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  // Trading items don't need job cards — no manufacturing materials
  if (order.product.productType === 'TRADING') {
    return NextResponse.json({ error: 'Trading items do not require job cards — no manufacturing stages' }, { status: 400 });
  }

  const { voltage, quantity: orderQty, productId } = order;

  // Get BOM items for this product+voltage+stage (null stage = applies to all stages)
  const bomItems = await prisma.bOMItem.findMany({
    where: {
      productId,
      AND: [
        { OR: [{ stage: stage as StageType }, { stage: null }] },
        { OR: [{ voltage: voltage }, { voltage: null }, { voltage: '' }] },
      ],
    },
  });

  const cardNumber = await generateNextJobCardNumber();

  // If no BOM items configured, create job card as IN_PROGRESS (no materials to track)
  const jobCard = await prisma.jobCard.create({
    data: {
      cardNumber,
      orderId,
      orderQuantity: orderQty,
      stage: stage as StageType,
      status: bomItems.length === 0 ? 'IN_PROGRESS' : 'PENDING',
      createdById: session.id,
      ...(bomItems.length > 0 ? {
        items: {
          create: bomItems.map(b => ({
            rawMaterialId: b.rawMaterialId,
            quantityReq: b.quantityRequired * orderQty,
            isCritical: b.isCritical,
          }))
        }
      } : {}),
    },
    include: {
      order: { select: { orderNumber: true, quantity: true } },
      items: {
        include: {
          rawMaterial: {
            select: {
              id: true, name: true, code: true, unit: true,
              barcode: true, currentStock: true,
              purchaseUnit: true, conversionFactor: true
            }
          },
        }
      }
    }
  });

  return NextResponse.json(jobCard);
}
