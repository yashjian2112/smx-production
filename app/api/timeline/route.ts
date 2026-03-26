import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');
    const { searchParams } = new URL(req.url);
    const serial = searchParams.get('serial');
    const orderId = searchParams.get('orderId');
    const userId = searchParams.get('userId');
    const stage = searchParams.get('stage');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const where: Record<string, unknown> = {};
    if (orderId) where.orderId = orderId;
    if (userId) where.userId = userId;
    if (stage) where.stage = stage;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
    }
    if (serial) {
      const units = await prisma.controllerUnit.findMany({
        where: { serialNumber: { contains: serial, mode: 'insensitive' } },
        select: { id: true },
      });
      if (units.length) where.unitId = { in: units.map((u) => u.id) };
      else where.unitId = 'impossible-id';
    }

    const logs = await prisma.timelineLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } }, unit: { select: { serialNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return NextResponse.json(logs);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
