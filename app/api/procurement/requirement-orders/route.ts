import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateRONumber } from '@/lib/procurement-numbers';

// GET /api/procurement/requirement-orders — list ROs
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'PURCHASE_MANAGER', 'STORE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status'); // PENDING | APPROVED | CONVERTED | CANCELLED

  const ros = await prisma.requirementOrder.findMany({
    where: status ? { status: status as any } : undefined,
    include: {
      items: {
        include: {
          material: { select: { id: true, name: true, code: true, unit: true, currentStock: true, minimumOrderQty: true } },
        },
      },
      approvedBy: { select: { id: true, name: true } },
      jobCard: { select: { id: true, cardNumber: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(ros);
}

// POST /api/procurement/requirement-orders — create manual RO
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { items, notes } = body as {
    items: { materialId: string; qtyRequired: number; notes?: string }[];
    notes?: string;
  };

  if (!items?.length) return NextResponse.json({ error: 'At least one item required' }, { status: 400 });

  const roNumber = await generateRONumber();
  const ro = await prisma.requirementOrder.create({
    data: {
      roNumber,
      trigger: 'MANUAL',
      status: 'PENDING',
      notes: notes ?? null,
      items: {
        create: items.map(i => ({
          materialId: i.materialId,
          qtyRequired: i.qtyRequired,
          notes: i.notes ?? null,
        })),
      },
    },
    include: {
      items: { include: { material: { select: { id: true, name: true, unit: true } } } },
    },
  });

  return NextResponse.json(ro, { status: 201 });
}
