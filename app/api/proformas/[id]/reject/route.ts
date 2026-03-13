import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  reason: z.string().min(1),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS');

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Reason is required' }, { status: 400 });

    const existing = await prisma.proformaInvoice.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (existing.status !== 'PENDING_APPROVAL')
      return NextResponse.json({ error: 'Invoice is not pending approval' }, { status: 400 });

    const proforma = await prisma.proformaInvoice.update({
      where: { id: params.id },
      data: {
        status:         'REJECTED',
        rejectedReason: parsed.data.reason,
      },
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
