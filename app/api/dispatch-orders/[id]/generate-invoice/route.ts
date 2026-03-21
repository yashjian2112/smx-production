import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextFinalInvoiceNumber } from '@/lib/invoice-number';

/**
 * POST /api/dispatch-orders/[id]/generate-invoice
 * Manually generate invoice(s) for an APPROVED dispatch order that has no invoices yet.
 * Used when the order's proforma was linked after the DO was approved.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS');

    // Fetch DO with order's proforma and packed items
    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      include: {
        order: {
          include: {
            proformaInvoice: {
              include: {
                client: { select: { id: true, globalOrIndian: true } },
                items:  { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
        boxes: {
          include: {
            items: { select: { unitId: true, serial: true } },
          },
        },
        invoices: { select: { id: true } },
      },
    });

    if (!dispatchOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (dispatchOrder.status !== 'APPROVED')
      return NextResponse.json({ error: 'Invoice can only be generated for APPROVED dispatch orders' }, { status: 400 });
    if (dispatchOrder.invoices.length > 0)
      return NextResponse.json({ error: 'Invoice already exists for this dispatch order' }, { status: 400 });

    const proforma = dispatchOrder.order.proformaInvoice;
    if (!proforma)
      return NextResponse.json(
        { error: 'No proforma invoice linked to this order. Go to Sales → link a proforma to the order first.' },
        { status: 400 }
      );

    const packedItems   = dispatchOrder.boxes.flatMap((b) => b.items);
    const packedUnitIds = packedItems.map((i) => i.unitId);
    const packedSerials = packedItems.map((i) => i.serial);

    const isExport =
      proforma.currency === 'USD' ||
      proforma.client?.globalOrIndian === 'Global';

    // Pre-generate invoice numbers OUTSIDE the transaction
    let preGenNumbers: string[] = [];
    if (proforma.splitInvoice && proforma.splitServicePercent != null) {
      const n1  = await generateNextFinalInvoiceNumber(isExport ?? false);
      // Derive n2 by incrementing n1's sequence — do NOT call again (both would return same number)
      const pfx = n1.split('/').slice(0, -1).join('/') + '/';
      const n2  = pfx + String(parseInt(n1.split('/').pop()!, 10) + 1).padStart(4, '0');
      preGenNumbers = [n1, n2];
    } else {
      const n1 = await generateNextFinalInvoiceNumber(isExport ?? false);
      preGenNumbers = [n1];
    }

    const generatedInvoiceNumbers: string[] = [];

    await prisma.$transaction(async (tx) => {
      const clientId     = proforma.clientId;
      const currency     = proforma.currency;
      const exchangeRate = proforma.exchangeRate ?? null;
      const notes        = proforma.notes ?? null;

      const productItems = proforma.items.filter((item) => item.hsnCode !== '9965');

      if (proforma.splitInvoice && proforma.splitServicePercent != null) {
        const servicePct = proforma.splitServicePercent;
        const goodsPct   = 100 - servicePct;

        const subtotal = productItems.reduce((sum, item) => {
          return sum + item.unitPrice * item.quantity * (1 - item.discountPercent / 100);
        }, 0);

        const serviceLineUnitPrice =
          packedUnitIds.length > 0
            ? (subtotal * servicePct) / 100 / packedUnitIds.length
            : 0;

        const goodsInvoiceNumber   = preGenNumbers[0];
        const serviceInvoiceNumber = preGenNumbers[1];
        generatedInvoiceNumbers.push(goodsInvoiceNumber, serviceInvoiceNumber);

        const goodsItems = productItems.map((item, idx) => ({
          description:     item.description,
          hsnCode:         item.hsnCode,
          quantity:        item.quantity,
          unitPrice:       item.unitPrice * (goodsPct / 100),
          discountPercent: item.discountPercent,
          sortOrder:       item.sortOrder ?? idx,
          serialNumbers:   idx === 0 ? JSON.stringify(packedSerials) : null,
        }));

        const serviceInvoice = await tx.invoice.create({
          data: {
            invoiceNumber:   serviceInvoiceNumber,
            dispatchOrderId: params.id,
            proformaId:      proforma.id,
            subType:         'SERVICE',
            splitPercent:    servicePct,
            clientId,
            currency,
            exchangeRate,
            notes,
            items: {
              create: [
                {
                  description:     'Motor Controller Tuning Service',
                  hsnCode:         '998316',
                  quantity:        packedUnitIds.length,
                  unitPrice:       serviceLineUnitPrice,
                  discountPercent: 0,
                  sortOrder:       0,
                  serialNumbers:   JSON.stringify(packedSerials),
                },
              ],
            },
          },
        });

        await tx.invoice.create({
          data: {
            invoiceNumber:    goodsInvoiceNumber,
            dispatchOrderId:  params.id,
            proformaId:       proforma.id,
            subType:          'GOODS',
            splitPercent:     goodsPct,
            relatedInvoiceId: serviceInvoice.id,
            clientId,
            currency,
            exchangeRate,
            notes,
            items: { create: goodsItems },
          },
        });
      } else {
        const fullInvoiceNumber = preGenNumbers[0];
        generatedInvoiceNumbers.push(fullInvoiceNumber);

        const allItems = proforma.items.map((item, idx) => ({
          description:     item.description,
          hsnCode:         item.hsnCode,
          quantity:        item.quantity,
          unitPrice:       item.unitPrice,
          discountPercent: item.discountPercent,
          sortOrder:       item.sortOrder ?? idx,
          serialNumbers:
            item.hsnCode !== '9965' &&
            idx === proforma.items.findIndex((i) => i.hsnCode !== '9965')
              ? JSON.stringify(packedSerials)
              : null,
        }));

        await tx.invoice.create({
          data: {
            invoiceNumber:   fullInvoiceNumber,
            dispatchOrderId: params.id,
            proformaId:      proforma.id,
            subType:         'FULL',
            clientId,
            currency,
            exchangeRate,
            notes,
            items: { create: allItems },
          },
        });
      }
    });

    return NextResponse.json({ generatedInvoiceNumbers });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[generate-invoice]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
