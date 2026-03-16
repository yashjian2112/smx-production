import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getFiscalYear } from '@/lib/invoice-number';

const createSchema = z.object({
  purchaseRequestId: z.string().min(1),
  vendorId:          z.string().min(1),
  expectedDelivery:  z.string().optional(),
  items: z.array(z.object({
    rawMaterialId: z.string().min(1),
    quantity:      z.number().positive(),
    unitPrice:     z.number().positive(),
  })).min(1),
});

async function generatePONumber(): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = `PO/${fy}/`;
  const latest = await prisma.purchaseOrder.findFirst({
    where:   { poNumber: { startsWith: prefix } },
    orderBy: { poNumber: 'desc' },
    select:  { poNumber: true },
  });
  let next = 1;
  if (latest) {
    const parts = latest.poNumber.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }
  return `${prefix}${String(next).padStart(3, '0')}`;
}

export async function GET() {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER', 'ACCOUNTS'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const orders = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      vendor:          { select: { name: true, code: true } },
      purchaseRequest: { select: { requestNumber: true, rawMaterial: { select: { name: true } } } },
      createdBy:       { select: { name: true } },
      items:           { include: { rawMaterial: { select: { name: true, unit: true } } } },
      _count:          { select: { receipts: true } },
    },
  });

  return NextResponse.json(orders);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = createSchema.parse(body);

  const totalAmount = data.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const poNumber    = await generatePONumber();

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      vendorId:          data.vendorId,
      purchaseRequestId: data.purchaseRequestId,
      totalAmount,
      expectedDelivery:  data.expectedDelivery ? new Date(data.expectedDelivery) : null,
      createdById:       session.id,
      status:            'DRAFT',
      items: {
        create: data.items.map((item) => ({
          rawMaterialId: item.rawMaterialId,
          quantity:      item.quantity,
          unitPrice:     item.unitPrice,
        })),
      },
    },
    include: {
      vendor:          { select: { name: true, code: true } },
      purchaseRequest: { select: { requestNumber: true } },
      items:           { include: { rawMaterial: { select: { name: true, unit: true } } } },
    },
  });

  // Update PR status
  await prisma.purchaseRequest.update({
    where: { id: data.purchaseRequestId },
    data:  { status: 'ORDERED' },
  });

  return NextResponse.json(po, { status: 201 });
}
