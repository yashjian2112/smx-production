import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextFinalInvoiceNumber } from '@/lib/invoice-number';
import { z } from 'zod';

const approveSchema = z.object({
  action: z.enum(['approve', 'reject']),
  rejectedReason: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS');

    const body = await req.json();
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
                items: { orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
        boxes: {
          include: {
            items: {
              select: {
                unitId: true,
                serial: true,
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
          data: { status: 'REJECTED', rejectedReason: rejectedReason.trim() },
        });
      });

      const updated = await prisma.dispatchOrder.findUnique({
        where: { id: params.id },
        include: {
          order: { select: { orderNumber: true } },
          createdBy: { select: { name: true } },
        },
      });
      return NextResponse.json(updated);
    }

    // ── APPROVE ──────────────────────────────────────────────────────────────────
    const packedItems = dispatchOrder.boxes.flatMap((b) => b.items);
    const packedUnitIds = packedItems.map((i) => i.unitId);
    const packedSerials = packedItems.map((i) => i.serial);
    const doNumber = dispatchOrder.doNumber;

    const proforma = dispatchOrder.order.proformaInvoice;
    const isExport =
      proforma?.currency === 'USD' ||
      dispatchOrder.order.proformaInvoice?.client?.globalOrIndian === 'Global';

    const generatedInvoiceNumbers: string[] = [];

    await prisma.$transaction(async (tx) => {
      // 1. Set DO approved
      await tx.dispatchOrder.update({
        where: { id: params.id },
        data: {
          status: 'APPROVED',
          approvedById: session.id,
          approvedAt: new Date(),
        },
      });

      // 2. Set packed units readyForDispatch=true
      if (packedUnitIds.length > 0) {
        await tx.controllerUnit.updateMany({
          where: { id: { in: packedUnitIds } },
          data: { readyForDispatch: true },
        });
      }

      // 3. Timeline log for each dispatched unit
      for (const item of packedItems) {
        await appendTimeline({
          unitId: item.unitId,
          orderId: dispatchOrder.orderId,
          userId: session.id,
          action: 'dispatched',
          stage: 'FINAL_ASSEMBLY',
          statusTo: 'APPROVED',
          remarks: `Shipped via ${doNumber}`,
        });
      }

      // 4. Check if all order units are now dispatched → close order
      const allOrderUnits = dispatchOrder.order.units;
      const alreadyDispatched = allOrderUnits.filter((u) => u.readyForDispatch).map((u) => u.id);
      const nowDispatched = new Set([...alreadyDispatched, ...packedUnitIds]);
      const allDispatched = allOrderUnits.every((u) => nowDispatched.has(u.id));
      if (allDispatched) {
        await tx.order.update({
          where: { id: dispatchOrder.orderId },
          data: { status: 'CLOSED' },
        });
      }

      // 5. Auto-generate Invoice(s)
      if (proforma) {
        const clientId = proforma.clientId;
        const currency = proforma.currency;
        const exchangeRate = proforma.exchangeRate ?? null;
        const notes = proforma.notes ?? null;

        // Product items only (exclude HSN 9965 shipping line)
        const productItems = proforma.items.filter(
          (item) => item.hsnCode !== '9965'
        );

        if (proforma.splitInvoice && proforma.splitServicePercent != null) {
          // ── SPLIT INVOICE ──────────────────────────────────────────────────────
          const servicePct = proforma.splitServicePercent;
          const goodsPct = 100 - servicePct;

          // Compute subtotal from proforma product items for service line pricing
          const subtotal = productItems.reduce((sum, item) => {
            const lineTotal =
              item.unitPrice * item.quantity * (1 - item.discountPercent / 100);
            return sum + lineTotal;
          }, 0);

          const serviceLineUnitPrice =
            packedUnitIds.length > 0
              ? (subtotal * servicePct) / 100 / packedUnitIds.length
              : 0;

          // Invoice 1: GOODS
          const goodsInvoiceNumber = await generateNextFinalInvoiceNumber(isExport ?? false);
          generatedInvoiceNumbers.push(goodsInvoiceNumber);

          const goodsItems = productItems.map((item, idx) => ({
            description: item.description,
            hsnCode: item.hsnCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice * (goodsPct / 100),
            discountPercent: item.discountPercent,
            sortOrder: item.sortOrder ?? idx,
            serialNumbers: idx === 0 ? JSON.stringify(packedSerials) : null,
          }));

          // Invoice 2: SERVICE
          const serviceInvoiceNumber = await generateNextFinalInvoiceNumber(isExport ?? false);
          generatedInvoiceNumbers.push(serviceInvoiceNumber);

          const serviceInvoice = await tx.invoice.create({
            data: {
              invoiceNumber: serviceInvoiceNumber,
              dispatchOrderId: params.id,
              proformaId: proforma.id,
              subType: 'SERVICE',
              splitPercent: servicePct,
              clientId,
              currency,
              exchangeRate,
              notes,
              items: {
                create: [
                  {
                    description: 'Motor Controller Tuning Service',
                    hsnCode: '998316',
                    quantity: packedUnitIds.length,
                    unitPrice: serviceLineUnitPrice,
                    discountPercent: 0,
                    sortOrder: 0,
                    serialNumbers: JSON.stringify(packedSerials),
                  },
                ],
              },
            },
          });

          // Create GOODS invoice linked to SERVICE invoice
          await tx.invoice.create({
            data: {
              invoiceNumber: goodsInvoiceNumber,
              dispatchOrderId: params.id,
              proformaId: proforma.id,
              subType: 'GOODS',
              splitPercent: goodsPct,
              relatedInvoiceId: serviceInvoice.id,
              clientId,
              currency,
              exchangeRate,
              notes,
              items: {
                create: goodsItems,
              },
            },
          });
        } else {
          // ── FULL INVOICE ───────────────────────────────────────────────────────
          const fullInvoiceNumber = await generateNextFinalInvoiceNumber(isExport ?? false);
          generatedInvoiceNumbers.push(fullInvoiceNumber);

          // Copy all proforma items (including shipping line if present)
          const allItems = proforma.items.map((item, idx) => ({
            description: item.description,
            hsnCode: item.hsnCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            sortOrder: item.sortOrder ?? idx,
            // Attach serials to first product item (non-shipping)
            serialNumbers:
              item.hsnCode !== '9965' && idx === proforma.items.findIndex((i) => i.hsnCode !== '9965')
                ? JSON.stringify(packedSerials)
                : null,
          }));

          await tx.invoice.create({
            data: {
              invoiceNumber: fullInvoiceNumber,
              dispatchOrderId: params.id,
              proformaId: proforma.id,
              subType: 'FULL',
              clientId,
              currency,
              exchangeRate,
              notes,
              items: {
                create: allItems,
              },
            },
          });
        }
      }
    });

    // Return the approved DO + generated invoice numbers
    const result = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      include: {
        order: {
          select: {
            orderNumber: true,
            status: true,
            client: { select: { customerName: true } },
            product: { select: { code: true, name: true } },
          },
        },
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        invoices: { select: { id: true, invoiceNumber: true, subType: true } },
        boxes: {
          orderBy: { boxNumber: 'asc' },
          include: { _count: { select: { items: true } } },
        },
      },
    });

    return NextResponse.json({
      ...result,
      generatedInvoiceNumbers,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
