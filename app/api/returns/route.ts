import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getFiscalYear } from '@/lib/invoice-number';
import { z } from 'zod';

export async function GET() {
  const session = await requireSession();
  if (!['ADMIN', 'SALES', 'ACCOUNTS', 'PRODUCTION_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const where = session.role === 'SALES' ? { reportedById: session.id } : {};

  const returns = await prisma.returnRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      client:      { select: { code: true, customerName: true } },
      reportedBy:  { select: { name: true } },
      evaluatedBy: { select: { name: true } },
    },
  });

  return NextResponse.json(returns.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
}

const postSchema = z.object({
  clientId:      z.string().min(1),
  serialNumber:  z.string().optional(),
  type:          z.enum(['WARRANTY', 'DAMAGE', 'WRONG_ITEM', 'OTHER']),
  reportedIssue: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (!['ADMIN', 'SALES', 'ACCOUNTS', 'PRODUCTION_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Generate return number RTN/YY-YY/NNN
  const fy     = getFiscalYear();
  const prefix = `RTN/${fy}/`;

  const latest = await prisma.returnRequest.findFirst({
    where:   { returnNumber: { startsWith: prefix } },
    orderBy: { returnNumber: 'desc' },
    select:  { returnNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.returnNumber.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  const returnNumber = `${prefix}${String(next).padStart(3, '0')}`;

  // Look up unit/order from serial number if provided
  let unitId:  string | undefined;
  let orderId: string | undefined;

  if (data.serialNumber) {
    const unit = await prisma.controllerUnit.findFirst({
      where:  { serialNumber: data.serialNumber },
      select: { id: true, orderId: true },
    });
    if (unit) {
      unitId  = unit.id;
      orderId = unit.orderId;
    }
  }

  const returnRequest = await prisma.returnRequest.create({
    data: {
      returnNumber,
      clientId:      data.clientId,
      serialNumber:  data.serialNumber ?? null,
      unitId:        unitId ?? null,
      orderId:       orderId ?? null,
      type:          data.type,
      reportedIssue: data.reportedIssue,
      reportedById:  session.id,
    },
  });

  return NextResponse.json(returnRequest, { status: 201 });
}
