import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  trackingNumber: z.string().min(1).max(200),
});

/**
 * PATCH /api/dispatch-orders/[id]/tracking
 * Set a tracking number on an APPROVED dispatch order.
 * Stored in the notes field of all linked invoices as "Tracking: {number}".
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS');

    const body   = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { trackingNumber } = parsed.data;

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where:   { id: params.id },
      include: { invoices: { select: { id: true, notes: true } } },
    });

    if (!dispatchOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (dispatchOrder.status !== 'APPROVED')
      return NextResponse.json({ error: 'Can only set tracking on APPROVED dispatch orders' }, { status: 400 });

    if (dispatchOrder.invoices.length === 0)
      return NextResponse.json({ error: 'No invoices found for this dispatch order' }, { status: 400 });

    // Update each invoice's notes to include tracking
    const trackingLine = `Tracking: ${trackingNumber.trim()}`;
    await Promise.all(
      dispatchOrder.invoices.map(async (inv) => {
        // Remove any existing tracking line, then prepend the new one
        const baseNotes = (inv.notes ?? '')
          .split('\n')
          .filter((line) => !line.startsWith('Tracking:'))
          .join('\n')
          .trim();
        const newNotes = [trackingLine, baseNotes].filter(Boolean).join('\n');
        await prisma.invoice.update({
          where: { id: inv.id },
          data:  { notes: newNotes },
        });
      })
    );

    return NextResponse.json({ success: true, trackingNumber: trackingNumber.trim() });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[tracking]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
