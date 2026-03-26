import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextInvoiceNumber, generateNextExportInvoiceNumber, generateNextDomesticInvoiceNumber } from '@/lib/invoice-number';
import { z } from 'zod';

const itemSchema = z.object({
  description:     z.string().default(''),
  productId:       z.string().optional(),
  hsnCode:         z.string().min(1),
  quantity:        z.number().int().min(1),
  unitPrice:       z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  voltageFrom:     z.string().optional(),
  voltageTo:       z.string().optional(),
  sortOrder:       z.number().int().default(0),
});

const createSchema = z.object({
  clientId:         z.string().min(1),
  documentType:     z.enum(['PROFORMA', 'INVOICE']).default('PROFORMA'),
  invoiceType:      z.enum(['SALE', 'RETURN', 'REPLACEMENT']).default('SALE'),
  currency:         z.enum(['INR', 'USD', 'USD-INR']).default('INR'),
  exchangeRate:     z.number().positive().optional(),
  termsOfPayment:   z.string().optional(),
  deliveryDays:     z.number().int().min(1).optional(),
  termsOfDelivery:  z.string().optional(),
  notes:            z.string().optional(),
  relatedInvoiceId: z.string().optional(),
  items:            z.array(itemSchema).min(1),
  splitInvoice:        z.boolean().optional(),
  splitServicePercent: z.number().min(0).max(100).optional(),
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
    requireRole(session, 'ADMIN', 'SALES', 'ACCOUNTS');

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { clientId, documentType, invoiceType, currency, exchangeRate, termsOfPayment, deliveryDays,
            termsOfDelivery, notes, relatedInvoiceId, items, splitInvoice, splitServicePercent } = parsed.data;

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 400 });

    // For USD-INR: auto-fetch live exchange rate and lock it
    let finalExchangeRate = exchangeRate ?? null;
    if (currency === 'USD-INR' && !exchangeRate) {
      try {
        const rateRes = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR');
        if (rateRes.ok) {
          const rateData = await rateRes.json() as { rates: { INR: number } };
          finalExchangeRate = rateData.rates.INR ?? null;
        }
      } catch {
        // fetch failed — will return 400 below
      }
      if (finalExchangeRate === null) {
        return NextResponse.json(
          { error: 'Could not fetch USD-INR exchange rate. Please try again or provide the exchange rate manually.' },
          { status: 400 },
        );
      }
    }

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
        exchangeRate:    finalExchangeRate ?? null,
        termsOfPayment:  termsOfPayment  ?? null,
        deliveryDays:    deliveryDays    ?? null,
        termsOfDelivery: termsOfDelivery ?? null,
        notes:           notes           ?? null,
        relatedInvoiceId:relatedInvoiceId?? null,
        splitInvoice:    splitInvoice    ?? false,
        splitServicePercent: splitServicePercent ?? null,
        createdById:     session.id,
        items: {
          create: items.map((item, i) => ({
            description:     item.description,
            productId:       item.productId    ?? null,
            hsnCode:         item.hsnCode,
            quantity:        item.quantity,
            unitPrice:       item.unitPrice,
            discountPercent: item.discountPercent,
            voltageFrom:     item.voltageFrom ?? null,
            voltageTo:       item.voltageTo ?? null,
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
