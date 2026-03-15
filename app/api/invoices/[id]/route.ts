import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS', 'SALES', 'PRODUCTION_MANAGER');

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
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

    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
