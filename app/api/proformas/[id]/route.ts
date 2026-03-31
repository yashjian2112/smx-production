import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const itemSchema = z.object({
  id:              z.string().optional(),
  description:     z.string().default(''),
  productId:       z.string().optional(),
  hsnCode:         z.string().min(1),
  quantity:        z.number().int().min(1),
  unitPrice:       z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  voltageFrom:     z.string().optional().nullable(),
  voltageTo:       z.string().optional().nullable(),
  sortOrder:       z.number().int().default(0),
});

const patchSchema = z.object({
  clientId:            z.string().optional(),
  currency:            z.enum(['INR', 'USD']).optional(),
  exchangeRate:        z.number().positive().optional().nullable(),
  termsOfPayment:      z.string().optional(),
  deliveryDays:        z.number().int().min(1).optional().nullable(),
  termsOfDelivery:     z.string().optional(),
  notes:               z.string().optional(),
  items:               z.array(itemSchema).optional(),
  status:              z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CONVERTED']).optional(),
  splitInvoice:        z.boolean().optional(),
  splitServicePercent: z.number().min(0).max(100).optional().nullable(),
  shippingRoute:       z.enum(['AIR', 'LAND']).optional().nullable(),
  rejectedReason:      z.string().optional(),
  declaredAmount:      z.number().min(0).optional().nullable(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
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
    if (session.role === 'SALES' && proforma.createdById !== session.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    requireRole(session, 'ADMIN', 'SALES', 'ACCOUNTS');

    const existing = await prisma.proformaInvoice.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Only DRAFT can be edited by SALES; ACCOUNTS can only edit PENDING_APPROVAL; ADMIN can always edit
    if (session.role === 'SALES' && existing.createdById !== session.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (session.role === 'SALES' && existing.status !== 'DRAFT')
      return NextResponse.json({ error: 'Only draft invoices can be edited' }, { status: 400 });
    if (session.role === 'ACCOUNTS' && existing.status !== 'PENDING_APPROVAL')
      return NextResponse.json({ error: 'Accounts can only edit invoices pending approval' }, { status: 400 });

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    if (session.role === 'SALES' && parsed.data.status !== undefined && parsed.data.status !== 'PENDING_APPROVAL')
      return NextResponse.json({ error: 'Forbidden: SALES can only submit for approval' }, { status: 403 });

    // Mandatory signed PI (PDF) upload before sending for approval
    if (parsed.data.status === 'PENDING_APPROVAL' && !existing.paymentReceiptUrl)
      return NextResponse.json({ error: 'Please upload the signed PI (PDF) before sending for approval' }, { status: 400 });

    // Mandatory declared amount when submitting for approval
    if (parsed.data.status === 'PENDING_APPROVAL' && (parsed.data.declaredAmount == null || parsed.data.declaredAmount <= 0))
      return NextResponse.json({ error: 'Total amount is required when submitting for approval' }, { status: 400 });

    // Split invoice can only be changed in DRAFT status
    if ((parsed.data.splitInvoice !== undefined || parsed.data.splitServicePercent !== undefined) && existing.status !== 'DRAFT')
      return NextResponse.json({ error: 'Split invoice settings can only be changed while in draft' }, { status: 400 });

    // Validate declared amount does not exceed proforma total
    if (parsed.data.declaredAmount != null && parsed.data.declaredAmount > 0) {
      const piItems = await prisma.proformaInvoiceItem.findMany({ where: { proformaId: params.id } });
      const piTotal = piItems.reduce((s, i) => s + i.quantity * i.unitPrice * (1 - i.discountPercent / 100), 0);
      const client = await prisma.client.findUnique({ where: { id: existing.clientId }, select: { globalOrIndian: true } });
      const isExportPI = client?.globalOrIndian === 'Global';
      // For USD-INR (domestic USD), declared amount is in INR → convert subtotal to INR first
      const isUsdIndian = !isExportPI && existing.currency === 'USD';
      const baseTotal = isUsdIndian ? piTotal * (existing.exchangeRate ?? 1) : piTotal;
      const maxTotal = isExportPI ? piTotal : baseTotal * 1.18;
      if (parsed.data.declaredAmount > maxTotal * 1.01) // 1% tolerance for rounding
        return NextResponse.json({ error: `Declared amount cannot exceed the invoice total` }, { status: 400 });
    }

    const { items, rejectedReason, ...rest } = parsed.data;

    const proforma = await prisma.proformaInvoice.update({
      where: { id: params.id },
      data: {
        ...(rest.clientId        !== undefined && { clientId: rest.clientId }),
        ...(rest.currency        !== undefined && { currency: rest.currency }),
        ...(rest.exchangeRate    !== undefined && { exchangeRate: rest.exchangeRate }),
        ...(rest.termsOfPayment  !== undefined && { termsOfPayment: rest.termsOfPayment || null }),
        ...(rest.deliveryDays    !== undefined && { deliveryDays: rest.deliveryDays }),
        ...(rest.termsOfDelivery !== undefined && { termsOfDelivery: rest.termsOfDelivery || null }),
        ...(rest.notes                !== undefined && { notes: rest.notes || null }),
        ...(rest.status               !== undefined && { status: rest.status }),
        ...(rest.status === 'APPROVED' && { approvedById: session.id, approvedAt: new Date() }),
        ...(rest.status === 'REJECTED' && rejectedReason !== undefined && { rejectedReason }),
        ...(rest.splitInvoice         !== undefined && { splitInvoice: rest.splitInvoice }),
        ...(rest.splitServicePercent  !== undefined && { splitServicePercent: rest.splitServicePercent }),
        ...(rest.declaredAmount       !== undefined && { declaredAmount: rest.declaredAmount }),
        ...(rest.shippingRoute       !== undefined && { shippingRoute: rest.shippingRoute }),
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
              voltageFrom:     item.voltageFrom ?? null,
              voltageTo:       item.voltageTo ?? null,
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

    // SALES can only delete their own proformas
    if (session.role === 'SALES' && existing.createdById !== session.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
