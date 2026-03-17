import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  weightKg:  z.number().positive('Weight must be positive'),
  boxSizeId: z.string().min(1, 'Box size is required'),
});

/**
 * POST /api/dispatch-orders/[id]/boxes/[boxId]/confirm
 * Confirm a packed box: enter weight + select box size.
 * Requires label to have been scanned first (labelScanned = true).
 * Sets box.isSealed = true.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; boxId: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'PACKING');

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { weightKg, boxSizeId } = parsed.data;

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'PACKING')
      return NextResponse.json({ error: 'Dispatch order must be in PACKING status' }, { status: 400 });

    const box = await prisma.packingBox.findUnique({
      where: { id: params.boxId },
      select: { id: true, dispatchOrderId: true, isSealed: true, labelScanned: true, _count: { select: { items: true } } },
    });
    if (!box) return NextResponse.json({ error: 'Box not found' }, { status: 404 });
    if (box.dispatchOrderId !== params.id)
      return NextResponse.json({ error: 'Box does not belong to this dispatch order' }, { status: 400 });
    if (box.isSealed)
      return NextResponse.json({ error: 'Box is already confirmed' }, { status: 400 });
    if (!box.labelScanned)
      return NextResponse.json({ error: 'Box label must be scanned before confirming' }, { status: 400 });
    if (box._count.items === 0)
      return NextResponse.json({ error: 'Box has no items — cannot confirm an empty box' }, { status: 400 });

    // Verify box size exists
    const boxSize = await prisma.boxSize.findUnique({
      where: { id: boxSizeId },
      select: { id: true, active: true },
    });
    if (!boxSize || !boxSize.active)
      return NextResponse.json({ error: 'Box size not found or inactive' }, { status: 404 });

    const updated = await prisma.packingBox.update({
      where: { id: params.boxId },
      data: {
        isSealed:  true,
        weightKg,
        boxSizeId,
      },
      include: {
        boxSize: true,
        items: {
          orderBy: { scannedAt: 'asc' },
          include: { unit: { select: { serialNumber: true, finalAssemblyBarcode: true } } },
        },
      },
    });

    return NextResponse.json({ box: updated });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
