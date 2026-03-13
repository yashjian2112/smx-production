import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS');

    const existing = await prisma.proformaInvoice.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.status !== 'PENDING_APPROVAL')
      return NextResponse.json({ error: 'Invoice is not pending approval' }, { status: 400 });

    const proforma = await prisma.proformaInvoice.update({
      where: { id: params.id },
      data: {
        status:      'APPROVED',
        approvedById: session.id,
        approvedAt:   new Date(),
      },
      include: { client: true, items: { orderBy: { sortOrder: 'asc' } } },
    });
    return NextResponse.json(proforma);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
