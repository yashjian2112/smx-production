import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextJobCardNumber } from '@/lib/invoice-number';
import { StageType } from '@prisma/client';

export async function GET(req: NextRequest) {
  await requireSession();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const cards = await prisma.jobCard.findMany({
    where: status ? { status: status as any } : {},
    include: {
      order: { select: { orderNumber: true } },
      unit: { select: { serialNumber: true } },
      createdBy: { select: { name: true } },
      issuedBy: { select: { name: true } },
      items: {
        include: {
          rawMaterial: { select: { id: true, name: true, code: true, unit: true, barcode: true } },
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
  // Production employees and managers can create job cards
  if (!['PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { orderId, unitId, stage } = body;

  // Get unit's product and voltage for BOM lookup
  const unit = await prisma.controllerUnit.findUnique({
    where: { id: unitId },
    include: { order: { include: { product: true } } }
  });
  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });

  const voltage = unit.order.voltage;
  const productId = unit.order.productId;

  // Get BOM items for this product+voltage+stage
  const bomItems = await prisma.bOMItem.findMany({
    where: {
      productId,
      stage: stage as StageType,
      OR: [
        { voltage: voltage },
        { voltage: null }, // applies to all voltages
      ]
    },
    include: { rawMaterial: true }
  });

  const cardNumber = await generateNextJobCardNumber();

  const jobCard = await prisma.jobCard.create({
    data: {
      cardNumber,
      orderId,
      unitId,
      stage: stage as StageType,
      createdById: session.id,
      items: {
        create: bomItems.map(b => ({
          rawMaterialId: b.rawMaterialId,
          quantityReq: b.quantityRequired,
        }))
      }
    },
    include: {
      order: { select: { orderNumber: true } },
      unit: { select: { serialNumber: true } },
      items: {
        include: {
          rawMaterial: { select: { id: true, name: true, code: true, unit: true, barcode: true } },
        }
      }
    }
  });

  return NextResponse.json(jobCard);
}
