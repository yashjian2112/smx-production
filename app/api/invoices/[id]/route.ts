import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS', 'SALES');

    const salesFilter = session.role === 'SALES'
      ? { proforma: { createdById: session.id } }
      : {};

    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, ...salesFilter },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        client: true,
        dispatchOrder: {
          select: {
            doNumber: true,
            approvedAt: true,
            order: {
              select: {
                orderNumber: true,
                product: { select: { code: true, name: true } },
                client: { select: { customerName: true, globalOrIndian: true, state: true } },
              },
            },
          },
        },
        proforma: { select: { invoiceNumber: true } },
        relatedInvoice: { select: { id: true, invoiceNumber: true, subType: true } },
        relatedTo: { select: { id: true, invoiceNumber: true, subType: true } },
      },
    });

    if (!invoice) return NextResponse.json({ error: session.role === 'SALES' ? 'Forbidden' : 'Not found' }, { status: session.role === 'SALES' ? 403 : 404 });
    return NextResponse.json(invoice);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH — update invoice notes (used for saving tracking number)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS', 'SHIPPING');

    const body = await req.json() as { notes?: string };
    if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string')
      return NextResponse.json({ error: 'notes must be a string' }, { status: 400 });
    const invoice = await prisma.invoice.update({
      where: { id: params.id },
      data:  { notes: body.notes ?? null },
    });
    return NextResponse.json(invoice);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
