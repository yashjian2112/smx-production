import { NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const units = await prisma.controllerUnit.findMany({
      where: { currentStatus: 'WAITING_APPROVAL' },
      include: {
        order: { include: { product: true } },
        product: true,
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(units);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
