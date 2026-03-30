import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getFiscalYear } from '@/lib/invoice-number';

const schema = z.object({
  clientId:     z.string().min(1),
  serialNumber: z.string().nullable().optional(),
  productId:    z.string().nullable().optional(),
  voltage:      z.string().nullable().optional(),
  issue:        z.string().min(1),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (!['ADMIN', 'SALES'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body   = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
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
      orderId = unit.orderId ?? undefined;
    }
  }

  const returnRequest = await prisma.returnRequest.create({
    data: {
      returnNumber,
      clientId:     data.clientId,
      serialNumber: data.serialNumber ?? null,
      unitId:       unitId ?? null,
      orderId:      orderId ?? null,
      type:         'WARRANTY',
      reportedIssue: data.issue,
      reportedById: session.id,
    },
  });

  return NextResponse.json(returnRequest, { status: 201 });
}
