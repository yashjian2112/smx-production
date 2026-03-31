import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextFinalInvoiceNumber, generateNextReworkInvoiceNumber } from '@/lib/invoice-number';
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
        returnRequest: {
          select: {
            id: true,
            faultType: true,
            client: { select: { id: true, globalOrIndian: true } },
            unit: { select: { id: true, serialNumber: true, product: { select: { name: true, code: true } } } },
          },
        },
        boxes: {
          include: {
            items: {
              select: {
                unitId:  true,
                serial:  true,
                barcode: true,
                unit:    { select: { productId: true } },
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

    const proforma = dispatchOrder.order?.proformaInvoice ?? null;
    const isExport =
      proforma?.currency === 'USD' ||
      proforma?.client?.globalOrIndian === 'Global';

    const generatedInvoiceNumbers: string[] = [];

    // ── Rework invoice pre-gen ──────────────────────────────────────────────────
    const reworkReturn = dispatchOrder.returnRequest;
    const isReworkDO = !!reworkReturn;
    let reworkInvoiceNumber: string | null = null;
    if (isReworkDO && reworkReturn) {
      const isExportRework = reworkReturn.client?.globalOrIndian === 'Global';
      for (let attempt = 0; attempt < 3; attempt++) {
        const num = await generateNextReworkInvoiceNumber(isExportRework);
        const taken = await prisma.invoice.count({ where: { invoiceNumber: num } });
        if (taken === 0) { reworkInvoiceNumber = num; break; }
      }
      if (!reworkInvoiceNumber) {
        return NextResponse.json({ error: 'Could not generate unique rework invoice number — try again' }, { status: 409 });
      }
    }

    // ── Pre-generate invoice numbers OUTSIDE the transaction ─────────────────
    // CRITICAL: generateNextFinalInvoiceNumber uses the global prisma client.
    // Calling it inside prisma.$transaction can cause connection-pool deadlocks.
    // Generate all needed numbers before opening the transaction.
    // C1: Retry on duplicate (P2002) — if concurrent approval generates same number, regenerate.
    let preGenNumbers: string[] = [];
    if (proforma) {
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

      // 5a. Auto-generate Rework Invoice (RE prefix)
      if (isReworkDO && reworkReturn && reworkInvoiceNumber) {
        const clientId = reworkReturn.client?.id;
        const isExportRework = reworkReturn.client?.globalOrIndian === 'Global';
        const currency = isExportRework ? 'USD' : 'INR';
        const isMfgDefect = reworkReturn.faultType === 'MANUFACTURING_DEFECT';
        // Mfg defect = 1 INR/USD (warranty replacement), customer damage = actual repair value from DO
        const unitPrice = isMfgDefect ? 1 : (dispatchOrder.reworkUnitPrice ?? 1);
        const productName = reworkReturn.unit?.product?.name ?? 'Rework Unit';
        const productCode = reworkReturn.unit?.product?.code ?? '';
        const serialNumber = reworkReturn.unit?.serialNumber ?? '';
        const description = `${productName}${productCode ? ` (${productCode})` : ''} — Rework${isMfgDefect ? ' (Warranty)' : ' (Customer Damage)'}`;

        const totalAmount = unitPrice * packedUnitIds.length;
        generatedInvoiceNumbers.push(reworkInvoiceNumber);

        await tx.invoice.create({
          data: {
            invoiceNumber:   reworkInvoiceNumber,
            dispatchOrderId: params.id,
            subType:         'FULL',
            totalAmount,
            clientId:        clientId!,
            currency,
            items: {
              create: [{
                description,
                hsnCode:         '85044090',
                quantity:        packedUnitIds.length,
                unitPrice,
                discountPercent: 0,
                sortOrder:       0,
                serialNumbers:   JSON.stringify(packedSerials),
              }],
            },
          },
        });
      }

      // 5b. Auto-generate Invoice(s) using pre-generated numbers (normal order DOs)
      if (proforma && preGenNumbers.length > 0) {
        const clientId    = proforma.clientId;
        const currency    = proforma.currency;
        const exchangeRate = proforma.exchangeRate ?? null;
        const notes       = proforma.notes ?? null;

        // Count dispatched units per product to generate accurate invoice items
        const dispatchedByProduct = new Map<string, number>();
        for (const item of packedItems) {
          const pid = (item as any).unit?.productId as string | undefined;
          if (pid) dispatchedByProduct.set(pid, (dispatchedByProduct.get(pid) ?? 0) + 1);
        }

        // Product items only (exclude HSN 9965 shipping line)
        const productItems = proforma.items.filter((item) => item.hsnCode !== '9965');

        if (proforma.splitInvoice && proforma.splitServicePercent != null) {
          // ── SPLIT INVOICE ──────────────────────────────────────────────────
          const servicePct = proforma.splitServicePercent;
          const goodsPct   = 100 - servicePct;

          // Filter to only dispatched products for split invoice
          const dispatchedProductItems = productItems.filter((item) =>
            item.productId ? (dispatchedByProduct.get(item.productId) ?? 0) > 0 : false
          );

          const subtotal = dispatchedProductItems.reduce((sum, item) => {
            const qty = item.productId ? (dispatchedByProduct.get(item.productId) ?? 0) : 0;
            return sum + item.unitPrice * qty * (1 - item.discountPercent / 100);
          }, 0);

          const serviceLineUnitPrice =
            packedUnitIds.length > 0
              ? (subtotal * servicePct) / 100 / packedUnitIds.length
              : 0;

          const goodsInvoiceNumber   = preGenNumbers[0];
          const serviceInvoiceNumber = preGenNumbers[1];
          generatedInvoiceNumbers.push(goodsInvoiceNumber, serviceInvoiceNumber);

          const goodsItems = dispatchedProductItems.map((item, idx) => ({
            description:     item.description,
            hsnCode:         item.hsnCode,
            quantity:        item.productId ? (dispatchedByProduct.get(item.productId) ?? 0) : 0,
            unitPrice:       item.unitPrice * (goodsPct / 100),
            discountPercent: item.discountPercent,
            sortOrder:       item.sortOrder ?? idx,
            serialNumbers:   idx === 0 ? JSON.stringify(packedSerials) : null,
          }));

          // Create SERVICE invoice first
          const serviceTotalAmount = packedUnitIds.length * serviceLineUnitPrice;
          const serviceInvoice = await tx.invoice.create({
            data: {
              invoiceNumber:   serviceInvoiceNumber,
              dispatchOrderId: params.id,
              proformaId:      proforma.id,
              subType:         'SERVICE',
              splitPercent:    servicePct,
              totalAmount:     serviceTotalAmount,
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
          const goodsTotalAmount = goodsItems.reduce(
            (sum, item) => sum + item.quantity * item.unitPrice * (1 - item.discountPercent / 100),
            0
          );
          await tx.invoice.create({
            data: {
              invoiceNumber:   goodsInvoiceNumber,
              dispatchOrderId: params.id,
              proformaId:      proforma.id,
              subType:         'GOODS',
              splitPercent:    goodsPct,
              relatedInvoiceId: serviceInvoice.id,
              totalAmount:     goodsTotalAmount,
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

          // Only include PI items whose product was actually dispatched, with real qty
          const allItems = proforma.items
            .map((item, idx) => {
              if (item.hsnCode === '9965') {
                // Shipping line — include as-is (lump sum)
                return {
                  description:     item.description,
                  hsnCode:         item.hsnCode,
                  quantity:        item.quantity,
                  unitPrice:       item.unitPrice,
                  discountPercent: item.discountPercent,
                  sortOrder:       item.sortOrder ?? idx,
                  serialNumbers:   null as string | null,
                };
              }
              const qty = item.productId ? (dispatchedByProduct.get(item.productId) ?? 0) : 0;
              if (qty === 0) return null; // skip products not in this dispatch
              return {
                description:     item.description,
                hsnCode:         item.hsnCode,
                quantity:        qty,
                unitPrice:       item.unitPrice,
                discountPercent: item.discountPercent,
                sortOrder:       item.sortOrder ?? idx,
                serialNumbers:   null as string | null,
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);

          // Attach serial numbers to first product item
          const firstProductIdx = allItems.findIndex((i) => i.hsnCode !== '9965');
          if (firstProductIdx >= 0) {
            allItems[firstProductIdx].serialNumbers = JSON.stringify(packedSerials);
          }

          const fullTotalAmount = allItems.reduce(
            (sum, item) => sum + item.quantity * item.unitPrice * (1 - item.discountPercent / 100),
            0
          );
          await tx.invoice.create({
            data: {
              invoiceNumber:   fullInvoiceNumber,
              dispatchOrderId: params.id,
              proformaId:      proforma.id,
              subType:         'FULL',
              totalAmount:     fullTotalAmount,
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
