import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextInvoiceNumber, generateNextExportInvoiceNumber, generateNextDomesticInvoiceNumber } from '@/lib/invoice-number';
import { z } from 'zod';

const itemSchema = z.object({
  description:     z.string().min(1),
  productId:       z.string().optional(),
  hsnCode:         z.string().min(1),
  quantity:        z.number().int().min(1),
  unitPrice:       z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  sortOrder:       z.number().int().default(0),
});

const createSchema = z.object({
  clientId:         z.string().min(1),
  documentType:     z.enum(['PROFORMA', 'INVOICE']).default('PROFORMA'),
  invoiceType:      z.enum(['SALE', 'RETURN', 'REPLACEMENT']).default('SALE'),
  currency:         z.enum(['INR', 'USD']).default('INR'),
  exchangeRate:     z.number().positive().optional(),
  termsOfPayment:   z.string().optional(),
  deliveryDays:     z.number().int().min(1).optional(),
  termsOfDelivery:  z.string().optional(),
  notes:            z.string().optional(),
  relatedInvoiceId: z.string().optional(),
  items:            z.array(itemSchema).min(1),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const status  = searchParams.get('status');
    const mine    = searchParams.get('mine') === 'true';

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (mine)   where.createdById = session.id;

    const proformas = await prisma.proformaInvoice.findMany({
      where,
      include: {
        client:    { select: { id: true, code: true, customerName: true, globalOrIndian: true } },
        createdBy: { select: { id: true, name: true } },
        approvedBy:{ select: { id: true, name: true } },
        _count:    { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return NextResponse.json(proformas);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'SALES');

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { clientId, documentType, invoiceType, currency, exchangeRate, termsOfPayment, deliveryDays,
            termsOfDelivery, notes, relatedInvoiceId, items } = parsed.data;

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 400 });

    let invoiceNumber: string;
    if (documentType === 'INVOICE' && invoiceType === 'SALE') {
      invoiceNumber = client.globalOrIndian === 'Global'
        ? await generateNextExportInvoiceNumber()
        : await generateNextDomesticInvoiceNumber();
    } else {
      invoiceNumber = await generateNextInvoiceNumber();
    }

    const proforma = await prisma.proformaInvoice.create({
      data: {
        invoiceNumber,
        clientId,
        invoiceType,
        currency,
        exchangeRate:    exchangeRate    ?? null,
        termsOfPayment:  termsOfPayment  ?? null,
        deliveryDays:    deliveryDays    ?? null,
        termsOfDelivery: termsOfDelivery ?? null,
        notes:           notes           ?? null,
        relatedInvoiceId:relatedInvoiceId?? null,
        createdById:     session.id,
        items: {
          create: items.map((item, i) => ({
            description:     item.description,
            productId:       item.productId    ?? null,
            hsnCode:         item.hsnCode,
            quantity:        item.quantity,
            unitPrice:       item.unitPrice,
            discountPercent: item.discountPercent,
            sortOrder:       item.sortOrder ?? i,
          })),
        },
      },
      include: {
        client: true,
        items:  { orderBy: { sortOrder: 'asc' } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(proforma, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
