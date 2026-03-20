import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  scannedLabel: z.string().min(1),
});

/**
 * POST /api/dispatch-orders/[id]/boxes/[boxId]/verify-label
 * Verify a printed box label by scanning it.
 * The scanned barcode must match box.boxLabel exactly.
 * Sets box.labelScanned = true.
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

    const { scannedLabel } = parsed.data;

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (!['PACKING', 'DISPATCHED'].includes(dispatchOrder.status))
      return NextResponse.json({ error: 'Dispatch order must be in PACKING or DISPATCHED status' }, { status: 400 });

    const box = await prisma.packingBox.findUnique({
      where: { id: params.boxId },
      select: { id: true, dispatchOrderId: true, boxLabel: true, isSealed: true, labelScanned: true },
    });
    if (!box) return NextResponse.json({ error: 'Box not found' }, { status: 404 });
    if (box.dispatchOrderId !== params.id)
      return NextResponse.json({ error: 'Box does not belong to this dispatch order' }, { status: 400 });
    if (box.isSealed)
      return NextResponse.json({ error: 'Box is already confirmed' }, { status: 400 });

    // Check label matches
    if (scannedLabel.trim().toUpperCase() !== box.boxLabel.toUpperCase())
      return NextResponse.json(
        { error: `Label mismatch. Expected: ${box.boxLabel}, got: ${scannedLabel}` },
        { status: 400 }
      );

    const updated = await prisma.packingBox.update({
      where: { id: params.boxId },
      data: { labelScanned: true, isSealed: true },
    });

    return NextResponse.json({ success: true, labelScanned: updated.labelScanned, isSealed: updated.isSealed });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
