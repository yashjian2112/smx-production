import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getFiscalYear } from '@/lib/invoice-number';

const createSchema = z.object({
  rawMaterialId:    z.string().min(1),
  quantityRequired: z.number().positive(),
  unit:             z.string().min(1),
  urgency:          z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  notes:            z.string().optional(),
});

async function generatePRNumber(): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = `PR/${fy}/`;
  const latest = await prisma.purchaseRequest.findFirst({
    where:   { requestNumber: { startsWith: prefix } },
    orderBy: { requestNumber: 'desc' },
    select:  { requestNumber: true },
  });
  let next = 1;
  if (latest) {
    const parts = latest.requestNumber.split('/');
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

  const requests = await prisma.purchaseRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      rawMaterial:    { select: { name: true, unit: true, currentStock: true } },
      requestedBy:    { select: { name: true } },
      bidInvitations: {
        include: {
          vendor: { select: { name: true, code: true } },
          bid:    true,
        },
      },
      _count: { select: { purchaseOrders: true } },
    },
  });

  return NextResponse.json(requests);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = createSchema.parse(body);

  const requestNumber = await generatePRNumber();

  const pr = await prisma.purchaseRequest.create({
    data: {
      requestNumber,
      rawMaterialId:    data.rawMaterialId,
      quantityRequired: data.quantityRequired,
      unit:             data.unit,
      urgency:          data.urgency,
      notes:            data.notes,
      requestedById:    session.id,
      status:           'DRAFT',
    },
    include: {
      rawMaterial: { select: { name: true, unit: true } },
      requestedBy: { select: { name: true } },
    },
  });

  return NextResponse.json(pr, { status: 201 });
}
