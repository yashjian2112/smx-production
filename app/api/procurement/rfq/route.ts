import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateRFQNumber } from '@/lib/procurement-numbers';

// GET /api/procurement/rfq — list all RFQs
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const rfqs = await prisma.rFQ.findMany({
    where: status ? { status: status as any } : undefined,
    include: {
      createdBy: { select: { name: true } },
      items: {
        include: {
          material: { select: { id: true, name: true, code: true, unit: true } },
          roItem: { select: { id: true, qtyRequired: true, ro: { select: { roNumber: true } } } },
        },
      },
      vendorInvites: {
        include: { vendor: { select: { id: true, name: true, code: true } } },
      },
      quotes: {
        include: {
          vendor: { select: { id: true, name: true, code: true } },
          items: true,
        },
      },
      _count: { select: { quotes: true, vendorInvites: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(rfqs);
}

// POST /api/procurement/rfq — PM creates RFQ from approved RO items
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, fileUrls, deadline, vendorIds, roItems } = body as {
    title: string;
    description?: string;
    fileUrls?: string[];
    deadline?: string;
    vendorIds: string[];
    roItems: { roItemId: string; materialId: string; qtyRequired: number }[];
  };

  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400 });
  if (!vendorIds?.length || vendorIds.length < 5) {
    return NextResponse.json({ error: `Minimum 5 vendors required per RFQ. You selected ${vendorIds?.length ?? 0}.` }, { status: 400 });
  }
  if (!roItems?.length) return NextResponse.json({ error: 'Select at least one item' }, { status: 400 });

  // Validate all RO items belong to APPROVED ROs
  const roItemRecords = await prisma.requirementOrderItem.findMany({
    where: { id: { in: roItems.map(i => i.roItemId) } },
    include: { ro: { select: { status: true, roNumber: true } } },
  });
  if (roItemRecords.length !== roItems.length) {
    return NextResponse.json({ error: 'One or more RO items not found' }, { status: 400 });
  }
  const unapproved = roItemRecords.filter(r => r.ro.status !== 'APPROVED');
  if (unapproved.length > 0) {
    return NextResponse.json({
      error: `Cannot create RFQ: RO items must be from APPROVED orders. Found items from: ${unapproved.map(u => u.ro.roNumber).join(', ')}`
    }, { status: 400 });
  }

  const rfqNumber = await generateRFQNumber();

  const rfq = await prisma.rFQ.create({
    data: {
      rfqNumber,
      title,
      description: description ?? null,
      fileUrls: fileUrls ?? [],
      deadline: deadline ? new Date(deadline) : null,
      status: 'OPEN',
      createdById: session.id,
      items: {
        create: roItems.map(i => ({
          roItemId: i.roItemId,
          materialId: i.materialId,
          qtyRequired: i.qtyRequired,
        })),
      },
      vendorInvites: {
        create: vendorIds.map(vendorId => ({ vendorId })),
      },
    },
    include: {
      items: { include: { material: { select: { name: true, unit: true } } } },
      vendorInvites: { include: { vendor: { select: { name: true, email: true } } } },
    },
  });

  // Mark RO items as CONVERTED
  const roItemIds = roItems.map(i => i.roItemId);
  const roIds = await prisma.requirementOrderItem.findMany({
    where: { id: { in: roItemIds } },
    select: { roId: true },
  });
  const uniqueROIds = Array.from(new Set(roIds.map((r: { roId: string }) => r.roId)));
  await prisma.requirementOrder.updateMany({
    where: { id: { in: uniqueROIds } },
    data: { status: 'CONVERTED' },
  });

  return NextResponse.json(rfq, { status: 201 });
}
