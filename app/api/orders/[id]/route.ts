import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireSession();
    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        product: true,
        units: { orderBy: { serialNumber: 'asc' } },
      },
    });
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(order);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER');
    const { id } = await params;
    const body = await req.json();
    const { status, dueDate, priority } = body as { status?: string; dueDate?: string; priority?: number };

    const order = await prisma.order.update({
      where: { id },
      data: {
        ...(status !== undefined && { status: status as 'ACTIVE' | 'HOLD' | 'CANCELLED' | 'CLOSED' }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(priority !== undefined && { priority }),
      },
      include: { product: true, units: true },
    });
    return NextResponse.json(order);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
