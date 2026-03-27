import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getFiscalYear } from '@/lib/invoice-number';

async function generateSampleNumber(): Promise<string> {
  const fy = getFiscalYear();
  const prefix = `SAMP/${fy}/`;

  const latest = await prisma.sampleRequest.findFirst({
    where: { sampleNumber: { startsWith: prefix } },
    orderBy: { sampleNumber: 'desc' },
    select: { sampleNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.sampleNumber.split('/');
    const seq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }

  return `${prefix}${String(next).padStart(3, '0')}`;
}

export async function GET() {
  try {
    const session = await requireSession();

    if (!['ADMIN', 'SALES'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const where = session.role === 'SALES'
      ? { requestedById: session.id }
      : {};

    const samples = await prisma.sampleRequest.findMany({
      where,
      select: {
        id: true,
        sampleNumber: true,
        status: true,
        quantity: true,
        description: true,
        notes: true,
        createdAt: true,
        approvedAt: true,
        dispatchedAt: true,
        returnedAt: true,
        client: { select: { id: true, code: true, customerName: true } },
        product: { select: { id: true, code: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const serialized = samples.map((s) => ({
      ...s,
      createdAt:    s.createdAt.toISOString(),
      approvedAt:   s.approvedAt?.toISOString()   ?? null,
      dispatchedAt: s.dispatchedAt?.toISOString() ?? null,
      returnedAt:   s.returnedAt?.toISOString()   ?? null,
    }));

    return NextResponse.json(serialized);
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

    if (!['ADMIN', 'SALES'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { clientId, productId, description, quantity, notes } = body;

    if (!clientId || typeof clientId !== 'string') {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }
    if (!quantity || typeof quantity !== 'number' || quantity < 1) {
      return NextResponse.json({ error: 'quantity must be a positive number' }, { status: 400 });
    }

    // SALES can only have 1 active sample at a time
    if (session.role === 'SALES') {
      const active = await prisma.sampleRequest.findFirst({
        where: {
          requestedById: session.id,
          status: { notIn: ['CLOSED', 'RETURNED'] },
        },
        select: { id: true },
      });
      if (active) {
        return NextResponse.json(
          { error: 'You already have an active sample request. Close or return it before creating a new one.' },
          { status: 409 }
        );
      }
    }

    const sampleNumber = await generateSampleNumber();

    const sample = await prisma.sampleRequest.create({
      data: {
        sampleNumber,
        clientId,
        productId:    productId || null,
        description:  description || null,
        quantity,
        notes:        notes || null,
        requestedById: session.id,
      },
      select: {
        id: true,
        sampleNumber: true,
        status: true,
        quantity: true,
        description: true,
        notes: true,
        createdAt: true,
        approvedAt: true,
        dispatchedAt: true,
        returnedAt: true,
        client: { select: { id: true, code: true, customerName: true } },
        product: { select: { id: true, code: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      ...sample,
      createdAt:    sample.createdAt.toISOString(),
      approvedAt:   sample.approvedAt?.toISOString()   ?? null,
      dispatchedAt: sample.dispatchedAt?.toISOString() ?? null,
      returnedAt:   sample.returnedAt?.toISOString()   ?? null,
    }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
