import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET — all pending + recently issued rework material requests (for store manager view)
export async function GET() {
  const session = await requireSession();
  if (!['ADMIN', 'STORE_MANAGER', 'PRODUCTION_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const mats = await prisma.reworkMaterial.findMany({
    where:   { status: { in: ['PENDING', 'ISSUED'] } },
    include: {
      returnRequest: { select: { returnNumber: true, id: true, serialNumber: true, client: { select: { customerName: true } } } },
      rawMaterial:   { select: { currentStock: true, unit: true } },
      requestedBy:   { select: { name: true } },
      issuedBy:      { select: { name: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    take: 200,
  });

  return NextResponse.json(mats.map(m => ({
    ...m,
    currentStock: m.rawMaterial.currentStock,
    createdAt: m.createdAt.toISOString(),
    issuedAt:  m.issuedAt?.toISOString() ?? null,
  })));
}
