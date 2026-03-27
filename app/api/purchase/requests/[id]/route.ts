import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const updateSchema = z.object({
  status:  z.enum(['DRAFT', 'OPEN', 'BIDDING', 'AWARDED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']).optional(),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  notes:   z.string().optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER', 'ACCOUNTS');

    const pr = await prisma.purchaseRequest.findUnique({
      where: { id: params.id },
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

    if (!pr) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(pr);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = updateSchema.parse(body);

  const pr = await prisma.purchaseRequest.update({
    where: { id: params.id },
    data,
    include: {
      rawMaterial:    { select: { name: true, unit: true } },
      requestedBy:    { select: { name: true } },
      bidInvitations: {
        include: {
          vendor: { select: { name: true, code: true } },
          bid:    true,
        },
      },
    },
  });

  return NextResponse.json(pr);
}
