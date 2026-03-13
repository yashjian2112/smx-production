import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const itemSchema = z.object({
  id:              z.string().optional(),
  description:     z.string().min(1),
  productId:       z.string().optional(),
  hsnCode:         z.string().min(1),
  quantity:        z.number().int().min(1),
  unitPrice:       z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  sortOrder:       z.number().int().default(0),
});

const patchSchema = z.object({
  clientId:         z.string().optional(),
  currency:         z.enum(['INR', 'USD']).optional(),
  exchangeRate:     z.number().positive().optional().nullable(),
  termsOfPayment:   z.string().optional(),
  deliveryDays:     z.number().int().min(1).optional().nullable(),
  termsOfDelivery:  z.string().optional(),
  notes:            z.string().optional(),
  items:            z.array(itemSchema).optional(),
  status:           z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED']).optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const proforma = await prisma.proformaInvoice.findUnique({
      where: { id: params.id },
      include: {
        client:        true,
        createdBy:     { select: { id: true, name: true } },
        approvedBy:    { select: { id: true, name: true } },
        items:         { orderBy: { sortOrder: 'asc' }, include: { product: { select: { id: true, code: true, name: true } } } },
        order:         { select: { id: true, orderNumber: true, status: true } },
        relatedInvoice:{ select: { id: true, invoiceNumber: true } },
      },
    });
    if (!proforma) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(proforma);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'SALES');

    const existing = await prisma.proformaInvoice.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Only DRAFT can be edited by SALES; ADMIN can always edit
    if (session.role === 'SALES' && existing.status !== 'DRAFT')
      return NextResponse.json({ error: 'Only draft invoices can be edited' }, { status: 400 });

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { items, ...rest } = parsed.data;

    const proforma = await prisma.proformaInvoice.update({
      where: { id: params.id },
      data: {
        ...(rest.clientId        !== undefined && { clientId: rest.clientId }),
        ...(rest.currency        !== undefined && { currency: rest.currency }),
        ...(rest.exchangeRate    !== undefined && { exchangeRate: rest.exchangeRate }),
        ...(rest.termsOfPayment  !== undefined && { termsOfPayment: rest.termsOfPayment || null }),
        ...(rest.deliveryDays    !== undefined && { deliveryDays: rest.deliveryDays }),
        ...(rest.termsOfDelivery !== undefined && { termsOfDelivery: rest.termsOfDelivery || null }),
        ...(rest.notes           !== undefined && { notes: rest.notes || null }),
        ...(rest.status          !== undefined && { status: rest.status }),
        ...(items !== undefined && {
          items: {
            deleteMany: {},
            create: items.map((item, i) => ({
              description:     item.description,
              productId:       item.productId ?? null,
              hsnCode:         item.hsnCode,
              quantity:        item.quantity,
              unitPrice:       item.unitPrice,
              discountPercent: item.discountPercent,
              sortOrder:       item.sortOrder ?? i,
            })),
          },
        }),
      },
      include: {
        client:    true,
        items:     { orderBy: { sortOrder: 'asc' }, include: { product: { select: { id: true, code: true, name: true } } } },
        createdBy: { select: { id: true, name: true } },
        approvedBy:{ select: { id: true, name: true } },
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

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'SALES');

    const existing = await prisma.proformaInvoice.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Only DRAFT can be deleted
    if (existing.status !== 'DRAFT')
      return NextResponse.json({ error: 'Only draft invoices can be deleted' }, { status: 400 });

    await prisma.proformaInvoice.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
