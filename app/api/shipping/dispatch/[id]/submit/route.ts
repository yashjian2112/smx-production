import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// BUG#6 FIX: boxPhotoUrl required here — no longer optional
const submitSchema = z.object({
  boxPhotoUrl:   z.string().url('Box photo URL is required'),
  isPartial:     z.boolean().default(false),
  partialReason: z.string().optional(),
});

/**
 * POST /api/shipping/dispatch/[id]/submit
 * Submit a DRAFT dispatch for accounts approval.
 * Requires at least 1 scanned unit and a valid box photo URL.
 *
 * FIX BUG#5: isPartial derived server-side; user flag only used for confirmation intent.
 * FIX BUG#6: boxPhotoUrl is now required in Zod schema.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'ACCOUNTS', 'SHIPPING');

    const body = submitSchema.parse(await req.json());

    const dispatch = await prisma.dispatch.findUnique({
      where:   { id: params.id },
      include: { items: true, order: { select: { quantity: true } } },
    });
    if (!dispatch) return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });
    if (dispatch.status !== 'DRAFT')
      return NextResponse.json({ error: 'Dispatch is not in DRAFT state' }, { status: 400 });

    if (dispatch.items.length === 0)
      return NextResponse.json({ error: 'Scan at least one controller before submitting.' }, { status: 400 });

    // BUG#5 FIX: server computes isPartial authoritatively
    const isPartial = dispatch.items.length < dispatch.order.quantity;

    if (isPartial && !body.isPartial)
      return NextResponse.json(
        { error: 'This is a partial dispatch. Please confirm and provide a reason.' },
        { status: 400 }
      );
    if (isPartial && body.isPartial && !body.partialReason?.trim())
      return NextResponse.json({ error: 'Please provide a reason for partial dispatch.' }, { status: 400 });

    const updated = await prisma.dispatch.update({
      where: { id: params.id },
      data: {
        status:        'SUBMITTED',
        boxPhotoUrl:   body.boxPhotoUrl,
        isPartial,
        partialReason: isPartial ? (body.partialReason ?? null) : null,
        submittedAt:   new Date(),
      },
      include: {
        items: {
          include: {
            unit:      { select: { serialNumber: true, finalAssemblyBarcode: true } },
            scannedBy: { select: { name: true } },
          },
        },
        order: {
          select: {
            orderNumber: true,
            quantity:    true,
            client:  { select: { customerName: true } },
            product: { select: { name: true, code: true } },
          },
        },
        dispatchedBy: { select: { name: true } },
      },
    });

    return NextResponse.json({ dispatch: updated });
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
