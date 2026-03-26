import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextInvoiceNumber } from '@/lib/invoice-number';

const schema = z.object({
  clientId:     z.string().min(1),
  notes:        z.string().min(1),  // pre-formatted [REPLACEMENT]\nSerial:...\nProblem:...
  serialNumber: z.string().nullable().optional(),
  productId:    z.string().nullable().optional(),
  quantity:     z.number().int().min(1).default(1),
  voltage:      z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (!['ADMIN', 'PRODUCTION_MANAGER', 'PRODUCTION_EMPLOYEE'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body   = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Determine product — look up from serial if provided
  let resolvedProductId: string | null = data.productId ?? null;
  if (data.serialNumber && !resolvedProductId) {
    const unit = await prisma.controllerUnit.findFirst({
      where:  { serialNumber: data.serialNumber },
      select: { order: { select: { productId: true } } },
    });
    if (unit?.order?.productId) resolvedProductId = unit.order.productId;
  }

  // Need at least one product to create a meaningful PI
  if (!resolvedProductId) {
    // Use first active product as fallback — replacement PI can be edited later
    const firstProduct = await prisma.product.findFirst({
      where: { active: true },
      select: { id: true },
      orderBy: { code: 'asc' },
    });
    if (!firstProduct) return NextResponse.json({ error: 'No products found' }, { status: 400 });
    resolvedProductId = firstProduct.id;
  }

  const product = await prisma.product.findUnique({
    where: { id: resolvedProductId },
    select: { id: true, name: true },
  });
  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  const invoiceNumber = await generateNextInvoiceNumber();

  // REPLACEMENT uses a special notes format the rework page parses
  const pi = await prisma.proformaInvoice.create({
    data: {
      invoiceNumber,
      invoiceDate:  new Date(),
      clientId:     data.clientId,
      invoiceType:  'REPLACEMENT',
      currency:     'INR',
      notes:        data.notes,
      status:       'DRAFT',
      createdById:  session.id,
      items: {
        create: [{
          productId:       resolvedProductId,
          hsnCode:         '85371000',
          description:     '',
          quantity:        data.quantity ?? 1,
          unitPrice:       0,
          discountPercent: 0,
          sortOrder:       0,
        }],
      },
    },
  });

  return NextResponse.json(pi, { status: 201 });
}
