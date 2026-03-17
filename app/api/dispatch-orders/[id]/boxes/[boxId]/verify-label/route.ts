import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/dispatch-orders/[id]/boxes/[boxId]/verify-label
// Scan a printed label to confirm it was physically applied → marks labelScanned + isSealed
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; boxId: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING');

    const { barcode } = await req.json() as { barcode?: string };
    if (!barcode) return NextResponse.json({ error: 'barcode required' }, { status: 400 });

    const box = await prisma.packingBox.findUnique({
      where:  { id: params.boxId },
      select: { id: true, dispatchOrderId: true, boxLabel: true, labelScanned: true },
    });
    if (!box) return NextResponse.json({ error: 'Box not found' }, { status: 404 });
    if (box.dispatchOrderId !== params.id)
      return NextResponse.json({ error: 'Box does not belong to this dispatch order' }, { status: 400 });

    const scanned = barcode.trim().toUpperCase();
    const label   = box.boxLabel.trim().toUpperCase();
    if (scanned !== label)
      return NextResponse.json({ error: `Wrong label — expected ${box.boxLabel}` }, { status: 400 });

    const updated = await prisma.packingBox.update({
      where: { id: params.boxId },
      data:  { labelScanned: true, isSealed: true },
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
