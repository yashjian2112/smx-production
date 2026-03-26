import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const serial = searchParams.get('serial');
    const orderId = searchParams.get('orderId');
    const stage = searchParams.get('stage');
    const status = searchParams.get('status');
    const assignedToMe = searchParams.get('assignedToMe') === 'true';

    const where: Record<string, unknown> = {};
    if (serial) where.serialNumber = { contains: serial, mode: 'insensitive' };
    if (orderId) where.orderId = orderId;
    if (stage) where.currentStage = stage;
    if (status) where.currentStatus = status;
    if (assignedToMe && session.role === 'PRODUCTION_EMPLOYEE') {
      where.assignments = { some: { userId: session.id } };
    }

    const units = await prisma.controllerUnit.findMany({
      where,
      include: {
        order: { include: { product: true } },
        product: true,
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { serialNumber: 'asc' },
      take: 500,
    });
    return NextResponse.json(units);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
