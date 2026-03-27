import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getFiscalYear } from '@/lib/invoice-number';

async function generateIGNumber(): Promise<string> {
  const fy = getFiscalYear();
  const prefix = `IG/${fy}/`;

  const latest = await prisma.implementationGood.findFirst({
    where: { igNumber: { startsWith: prefix } },
    orderBy: { igNumber: 'desc' },
    select: { igNumber: true },
  });

  let next = 1;
  if (latest) {
    const parts = latest.igNumber.split('/');
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
      ? { createdById: session.id }
      : {};

    const goods = await prisma.implementationGood.findMany({
      where,
      select: {
        id: true,
        igNumber: true,
        status: true,
        description: true,
        items: true,
        receivedDate: true,
        expectedReturn: true,
        returnedDate: true,
        purpose: true,
        notes: true,
        createdAt: true,
        client: { select: { id: true, code: true, customerName: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const serialized = goods.map((g) => ({
      ...g,
      receivedDate:   g.receivedDate.toISOString(),
      expectedReturn: g.expectedReturn?.toISOString() ?? null,
      returnedDate:   g.returnedDate?.toISOString()   ?? null,
      createdAt:      g.createdAt.toISOString(),
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
    const { clientId, description, items, receivedDate, expectedReturn, purpose, notes } = body;

    if (!clientId || typeof clientId !== 'string') {
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    }
    if (!description || typeof description !== 'string') {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 });
    }
    if (!receivedDate || typeof receivedDate !== 'string') {
      return NextResponse.json({ error: 'receivedDate is required' }, { status: 400 });
    }

    const igNumber = await generateIGNumber();

    const ig = await prisma.implementationGood.create({
      data: {
        igNumber,
        clientId,
        description,
        items: JSON.stringify(items),
        receivedDate: new Date(receivedDate),
        expectedReturn: expectedReturn ? new Date(expectedReturn) : null,
        purpose: purpose || null,
        notes: notes || null,
        createdById: session.id,
      },
      select: {
        id: true,
        igNumber: true,
        status: true,
        description: true,
        items: true,
        receivedDate: true,
        expectedReturn: true,
        returnedDate: true,
        purpose: true,
        notes: true,
        createdAt: true,
        client: { select: { id: true, code: true, customerName: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      ...ig,
      receivedDate:   ig.receivedDate.toISOString(),
      expectedReturn: ig.expectedReturn?.toISOString() ?? null,
      returnedDate:   ig.returnedDate?.toISOString()   ?? null,
      createdAt:      ig.createdAt.toISOString(),
    }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
