import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const scanSchema = z.object({
  barcode:            z.string().min(1),
  controllerPhotoUrl: z.string().url().optional(),
});

const removeSchema = z.object({ dispatchItemId: z.string().min(1) });
const patchSchema  = z.object({ dispatchItemId: z.string().min(1), controllerPhotoUrl: z.string().url() });

/**
 * POST /api/shipping/dispatch/[id]/scan
 * Scan a controller barcode and add it to the dispatch.
 * Validates that the scanned unit belongs to the correct order.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'ACCOUNTS');

    const body = scanSchema.parse(await req.json());
    const barcode = body.barcode.trim().toUpperCase();

    const dispatch = await prisma.dispatch.findUnique({
      where:  { id: params.id },
      select: { id: true, status: true, orderId: true },
    });
    if (!dispatch) return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });
    if (dispatch.status !== 'DRAFT')
      return NextResponse.json({ error: 'Dispatch is no longer in DRAFT state' }, { status: 400 });

    // Find unit by finalAssemblyBarcode
    const unit = await prisma.controllerUnit.findFirst({
      where: { finalAssemblyBarcode: barcode },
      select: {
        id:                   true,
        serialNumber:         true,
        finalAssemblyBarcode: true,
        orderId:              true,
        currentStage:         true,
        currentStatus:        true,
        readyForDispatch:     true,
        order: {
          select: { orderNumber: true, id: true },
        },
      },
    });

    if (!unit) {
      return NextResponse.json(
        { error: `No controller found with barcode "${barcode}". Check the sticker and try again.` },
        { status: 404 }
      );
    }

    // Wrong order check
    if (unit.orderId !== dispatch.orderId) {
      return NextResponse.json(
        {
          error: `❌ Wrong order! This controller (${unit.serialNumber}) belongs to Order #${unit.order.orderNumber}, not this order. Check the sticker.`,
          mismatch: true,
          unit: { serialNumber: unit.serialNumber, orderNumber: unit.order.orderNumber },
        },
        { status: 422 }
      );
    }

    // Eligibility check
    if (unit.currentStage !== 'FINAL_ASSEMBLY' || !['COMPLETED', 'APPROVED'].includes(unit.currentStatus)) {
      return NextResponse.json(
        { error: `Unit ${unit.serialNumber} has not completed Final Assembly yet.` },
        { status: 400 }
      );
    }

    if (unit.readyForDispatch) {
      return NextResponse.json(
        { error: `Unit ${unit.serialNumber} has already been dispatched.` },
        { status: 409 }
      );
    }

    // Already in this dispatch?
    const existing = await prisma.dispatchItem.findUnique({
      where: { dispatchId_unitId: { dispatchId: params.id, unitId: unit.id } },
    });
    if (existing) {
      return NextResponse.json(
        { error: `${unit.serialNumber} is already scanned in this dispatch.` },
        { status: 409 }
      );
    }

    // In another active dispatch?
    const otherActive = await prisma.dispatchItem.findFirst({
      where: {
        unitId:   unit.id,
        dispatch: { status: { in: ['DRAFT', 'SUBMITTED'] }, id: { not: params.id } },
      },
      select: { dispatch: { select: { dispatchNumber: true } } },
    });
    if (otherActive) {
      return NextResponse.json(
        { error: `${unit.serialNumber} is already locked in dispatch ${otherActive.dispatch.dispatchNumber}.` },
        { status: 409 }
      );
    }

    // Add to dispatch
    const item = await prisma.dispatchItem.create({
      data: {
        dispatchId:         params.id,
        unitId:             unit.id,
        serial:             unit.serialNumber,
        barcode:            barcode,
        controllerPhotoUrl: body.controllerPhotoUrl,
        scannedById:        session.id,
      },
      include: {
        unit:      { select: { id: true, serialNumber: true, finalAssemblyBarcode: true } },
        scannedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Invalid input' }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/shipping/dispatch/[id]/scan
 * Remove a scanned item from a DRAFT dispatch.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'ACCOUNTS');

    const body = removeSchema.parse(await req.json());

    const dispatch = await prisma.dispatch.findUnique({
      where:  { id: params.id },
      select: { status: true },
    });
    if (!dispatch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (dispatch.status !== 'DRAFT')
      return NextResponse.json({ error: 'Cannot remove items from a non-DRAFT dispatch' }, { status: 400 });

    await prisma.dispatchItem.delete({ where: { id: body.dispatchItemId } });
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

/**
 * PATCH /api/shipping/dispatch/[id]/scan
 * Update controller photo on an existing dispatch item.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'ACCOUNTS');

    const body = patchSchema.parse(await req.json());

    const dispatch = await prisma.dispatch.findUnique({
      where:  { id: params.id },
      select: { status: true },
    });
    if (!dispatch) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (dispatch.status !== 'DRAFT')
      return NextResponse.json({ error: 'Cannot update items on a non-DRAFT dispatch' }, { status: 400 });

    const item = await prisma.dispatchItem.update({
      where: { id: body.dispatchItemId },
      data:  { controllerPhotoUrl: body.controllerPhotoUrl },
    });
    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
