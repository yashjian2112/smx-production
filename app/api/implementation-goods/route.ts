import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextIGNumber } from '@/lib/invoice-number';

const IG_SELECT = {
  id: true,
  igNumber: true,
  status: true,
  description: true,
  items: true,
  purpose: true,
  notes: true,
  expectedArrival: true,
  expectedReturn: true,
  ganDate: true,
  ganNotes: true,
  courierDetails: true,
  grnDate: true,
  grnNotes: true,
  warehouseLocation: true,
  returnInitiatedAt: true,
  dnNumber: true,
  boxCount: true,
  dispatchedAt: true,
  dispatchCourier: true,
  trackingNumber: true,
  closedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, code: true, customerName: true } },
  createdBy: { select: { id: true, name: true } },
  ganBy: { select: { id: true, name: true } },
  grnBy: { select: { id: true, name: true } },
};

export async function GET() {
  try {
    const session = await requireSession();

    const allowed = ['ADMIN', 'SALES', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTS', 'PACKING', 'PRODUCTION_EMPLOYEE'];
    if (!allowed.includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // SALES sees only their own; others see all
    const where = session.role === 'SALES' ? { createdById: session.id } : {};

    const goods = await prisma.implementationGood.findMany({
      where,
      select: IG_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json(goods);
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
    const { clientId, description, items, expectedArrival, expectedReturn, purpose, notes } = body;

    if (!clientId || typeof clientId !== 'string')
      return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
    if (!description || typeof description !== 'string')
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    if (!items || !Array.isArray(items) || items.length === 0)
      return NextResponse.json({ error: 'items must be a non-empty array' }, { status: 400 });
    if (!expectedReturn || typeof expectedReturn !== 'string')
      return NextResponse.json({ error: 'Expected return date is required' }, { status: 400 });
    if (!purpose || typeof purpose !== 'string' || !purpose.trim())
      return NextResponse.json({ error: 'Purpose is required' }, { status: 400 });

    const igNumber = await generateNextIGNumber();

    const ig = await prisma.implementationGood.create({
      data: {
        igNumber,
        clientId,
        description,
        items: JSON.stringify(items),
        expectedArrival: expectedArrival ? new Date(expectedArrival) : null,
        expectedReturn: expectedReturn ? new Date(expectedReturn) : null,
        purpose: purpose || null,
        notes: notes || null,
        status: 'REQUESTED',
        createdById: session.id,
      },
      select: IG_SELECT,
    });

    // Create timeline entry
    await prisma.iGTimeline.create({
      data: {
        igId: ig.id,
        status: 'REQUESTED',
        action: 'Created IG request',
        notes: purpose || null,
        userId: session.id,
      },
    });

    return NextResponse.json(ig, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
