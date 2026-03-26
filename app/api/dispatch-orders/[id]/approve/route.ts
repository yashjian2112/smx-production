import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextFinalInvoiceNumber } from '@/lib/invoice-number';
import { z } from 'zod';

const approveSchema = z.object({
  action:         z.enum(['approve', 'reject']),
  rejectedReason: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS');

    const body   = await req.json();
    const parsed = approveSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { action, rejectedReason } = parsed.data;

    // Fetch full dispatch order
    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      include: {
        order: {
          include: {
            units: { select: { id: true, readyForDispatch: true } },
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
            items: {
              select: {
                unitId:  true,
                serial:  true,
                barcode: true,
              },
            },
          },
        },
      },
    });

    if (!dispatchOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (dispatchOrder.status !== 'SUBMITTED')
      return NextResponse.json({ error: 'Dispatch order must be SUBMITTED to approve or reject' }, { status: 400 });

    // ── REJECT ──────────────────────────────────────────────────────────────────
    if (action === 'reject') {
      if (!rejectedReason || rejectedReason.trim() === '')
        return NextResponse.json({ error: 'rejectedReason is required when rejecting' }, { status: 400 });

      await prisma.$transaction(async (tx) => {
        // Unlock all units: delete their PackingBoxItems
        const allItemIds = dispatchOrder.boxes.flatMap((b) => b.items.map((i) => i.unitId));
        if (allItemIds.length > 0) {
          await tx.packingBoxItem.deleteMany({
            where: { unitId: { in: allItemIds } },
          });
        }

        await tx.dispatchOrder.update({
          where: { id: params.id },
          data:  { status: 'REJECTED', rejectedReason: rejectedReason.trim() },
        });
      });

      const updated = await prisma.dispatchOrder.findUnique({
        where:   { id: params.id },
        include: {
          order:     { select: { orderNumber: true } },
          createdBy: { select: { name: true } },
        },
      });
      return NextResponse.json(updated);
    }

    // ── APPROVE ──────────────────────────────────────────────────────────────────
    const packedItems   = dispatchOrder.boxes.flatMap((b) => b.items);
    const packedUnitIds = packedItems.map((i) => i.unitId);
    const packedSerials = packedItems.map((i) => i.serial);
    const doNumber      = dispatchOrder.doNumber;

    const proforma = dispatchOrder.order.proformaInvoice;

    // Skip invoice generation for RETURN or REPLACEMENT proformas
    const skipInvoiceGeneration =
      proforma?.invoiceType === 'RETURN' || proforma?.invoiceType === 'REPLACEMENT';

    const isExport =
      proforma?.currency === 'USD' ||
      proforma?.client?.globalOrIndian === 'Global';

    const generatedInvoiceNumbers: string[] = [];

    // ── Pre-generate invoice numbers OUTSIDE the transaction ─────────────────
    // CRITICAL: generateNextFinalInvoiceNumber uses the global prisma client.
    // Calling it inside prisma.$transaction can cause connection-pool deadlocks.
    // Generate all needed numbers before opening the transaction.
    // C1: Retry on duplicate (P2002) — if concurrent approval generates same number, regenerate.
    let preGenNumbers: string[] = [];
    if (proforma && !skipInvoiceGeneration) {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (proforma.splitInvoice && proforma.splitServicePercent != null) {
          const n1  = await generateNextFinalInvoiceNumber(isExport ?? false);
          const pfx = n1.split('/').slice(0, -1).join('/') + '/';
          const n2  = pfx + String(parseInt(n1.split('/').pop()!, 10) + 1).padStart(4, '0');
          preGenNumbers = [n1, n2];
        } else {
          const n1 = await generateNextFinalInvoiceNumber(isExport ?? false);
          preGenNumbers = [n1];
        }
        // Check numbers aren't already used
        const taken = await prisma.invoice.count({ where: { invoiceNumber: { in: preGenNumbers } } });
        if (taken === 0) break;
        // Numbers taken by concurrent request — retry
        preGenNumbers = [];
      }
      if (preGenNumbers.length === 0) {
        return NextResponse.json({ error: 'Could not generate unique invoice number — try again' }, { status: 409 });
      }
    }

    await prisma.$transaction(async (tx) => {
      // 1. Set DO approved
      await tx.dispatchOrder.update({
        where: { id: params.id },
        data:  {
          status:      'APPROVED',
          approvedById: session.id,
          approvedAt:  new Date(),
        },
      });

      // 2. Set packed units readyForDispatch=true
      if (packedUnitIds.length > 0) {
        await tx.controllerUnit.updateMany({
          where: { id: { in: packedUnitIds } },
          data:  { readyForDispatch: true },
        });
      }

      // 3. Timeline log for each dispatched unit
      for (const item of packedItems) {
        await appendTimeline({
          unitId:   item.unitId,
          orderId:  dispatchOrder.orderId,
          userId:   session.id,
          action:   'dispatched',
          stage:    'FINAL_ASSEMBLY',
          statusTo: 'APPROVED',
          remarks:  `Shipped via ${doNumber}`,
        });
      }

      // 4. Check if all order units are now dispatched → close order
      const allOrderUnits  = dispatchOrder.order.units;
      const alreadyDisp    = allOrderUnits.filter((u) => u.readyForDispatch).map((u) => u.id);
      const nowDispatched  = new Set([...alreadyDisp, ...packedUnitIds]);
      const allDispatched  = allOrderUnits.every((u) => nowDispatched.has(u.id));
      if (allDispatched) {
        await tx.order.update({
          where: { id: dispatchOrder.orderId },
          data:  { status: 'CLOSED' },
        });
      }

      // 5. Auto-generate Invoice(s) using pre-generated numbers
      if (proforma && !skipInvoiceGeneration && preGenNumbers.length > 0) {
        const clientId    = proforma.clientId;
        const currency    = proforma.currency;
        const exchangeRate = proforma.exchangeRate ?? null;
        const notes       = proforma.notes ?? null;

        // Scale qty to dispatched units (not full order qty)
        // Shipping lines (HSN 9965) keep their original qty (lump sum)
        const totalOrderUnits = allOrderUnits.length;
        const dispatchedUnits = packedUnitIds.length;
        const scaleQty = (item: { quantity: number; hsnCode: string }) =>
          item.hsnCode === '9965' || totalOrderUnits === 0
            ? item.quantity
            : Math.round((item.quantity / totalOrderUnits) * dispatchedUnits);

        // Product items only (exclude HSN 9965 shipping line)
        const productItems = proforma.items.filter((item) => item.hsnCode !== '9965');

        if (proforma.splitInvoice && proforma.splitServicePercent != null) {
          // ── SPLIT INVOICE ──────────────────────────────────────────────────
          const servicePct = proforma.splitServicePercent;
          const goodsPct   = 100 - servicePct;

          const subtotal = productItems.reduce((sum, item) => {
            return sum + item.unitPrice * scaleQty(item) * (1 - item.discountPercent / 100);
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
            quantity:        scaleQty(item),
            unitPrice:       item.unitPrice * (goodsPct / 100),
            discountPercent: item.discountPercent,
            sortOrder:       item.sortOrder ?? idx,
            serialNumbers:   idx === 0 ? JSON.stringify(packedSerials) : null,
          }));

          // Create SERVICE invoice first
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

          // Create GOODS invoice linked to SERVICE invoice
          await tx.invoice.create({
            data: {
              invoiceNumber:   goodsInvoiceNumber,
              dispatchOrderId: params.id,
              proformaId:      proforma.id,
              subType:         'GOODS',
              splitPercent:    goodsPct,
              relatedInvoiceId: serviceInvoice.id,
              clientId,
              currency,
              exchangeRate,
              notes,
              items: { create: goodsItems },
            },
          });
        } else {
          // ── FULL INVOICE ──────────────────────────────────────────────────
          const fullInvoiceNumber = preGenNumbers[0];
          generatedInvoiceNumbers.push(fullInvoiceNumber);

          const allItems = proforma.items.map((item, idx) => ({
            description:     item.description,
            hsnCode:         item.hsnCode,
            quantity:        scaleQty(item),
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
      }
    });

    // Return the approved DO + generated invoice numbers
    const result = await prisma.dispatchOrder.findUnique({
      where:   { id: params.id },
      include: {
        order: {
          select: {
            orderNumber: true,
            status:      true,
            client:      { select: { customerName: true } },
            product:     { select: { code: true, name: true } },
          },
        },
        createdBy:  { select: { name: true } },
        approvedBy: { select: { name: true } },
        invoices:   { select: { id: true, invoiceNumber: true, subType: true } },
        boxes: {
          orderBy: { boxNumber: 'asc' },
          include: { _count: { select: { items: true } } },
        },
      },
    });

    return NextResponse.json({
      ...result,
      generatedInvoiceNumbers,
      noProforma: !proforma,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[approve-do]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
