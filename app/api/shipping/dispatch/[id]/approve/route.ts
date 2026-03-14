import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const approveSchema = z.object({
  action:         z.enum(['approve', 'reject']),
  rejectedReason: z.string().optional(),
});

/**
 * PATCH /api/shipping/dispatch/[id]/approve
 * Accounts approves or rejects a SUBMITTED dispatch.
 *
 * FIX BUG#14: Entire approve wrapped in transaction with atomic status check.
 * FIX BUG#8:  Timeline remarks clarified; statusTo kept as APPROVED (unit stays in stage).
 * FIX BUG#3:  On REJECT, dispatch items are deleted so units become available again.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS');

    const body = approveSchema.parse(await req.json());

    if (body.action === 'reject') {
      if (!body.rejectedReason?.trim())
        return NextResponse.json({ error: 'Rejection reason is required.' }, { status: 400 });

      // BUG#3 FIX: On reject, delete dispatch items so units are unlocked and visible again
      const updated = await prisma.$transaction(async (tx) => {
        const dispatch = await tx.dispatch.findUnique({
          where:  { id: params.id },
          select: { status: true },
        });
        if (!dispatch) throw new Error('NOT_FOUND');
        if (dispatch.status !== 'SUBMITTED') throw new Error('WRONG_STATUS');

        // Delete items → units are freed (no longer in an active dispatch)
        await tx.dispatchItem.deleteMany({ where: { dispatchId: params.id } });

        return tx.dispatch.update({
          where: { id: params.id },
          data:  { status: 'REJECTED', rejectedReason: body.rejectedReason },
        });
      });

      return NextResponse.json({ dispatch: updated });
    }

    // BUG#14 FIX: Atomic approve — check + update in one transaction
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const dispatch = await tx.dispatch.findUnique({
        where:   { id: params.id },
        include: {
          items: { select: { id: true, unitId: true, serial: true } },
          order: { select: { id: true, orderNumber: true } },
        },
      });
      if (!dispatch) throw new Error('NOT_FOUND');
      if (dispatch.status !== 'SUBMITTED') throw new Error('WRONG_STATUS');

      // Mark dispatch approved
      await tx.dispatch.update({
        where: { id: params.id },
        data:  { status: 'APPROVED', approvedById: session.id, approvedAt: now },
      });

      // Mark each unit as dispatched
      await tx.controllerUnit.updateMany({
        where: { id: { in: dispatch.items.map((i) => i.unitId) } },
        data:  { readyForDispatch: true },
      });

      // BUG#8 FIX: Use meaningful action string; statusTo reflects unit's actual current status
      await tx.timelineLog.createMany({
        data: dispatch.items.map((item) => ({
          unitId:   item.unitId,
          orderId:  dispatch.order.id,
          userId:   session.id,
          action:   'dispatched',
          stage:    'FINAL_ASSEMBLY' as const,
          statusTo: 'APPROVED' as const,
          remarks:  `Shipped via ${dispatch.dispatchNumber}. Order #${dispatch.order.orderNumber}.`,
          metadata: JSON.stringify({ dispatchId: params.id, dispatchNumber: dispatch.dispatchNumber }),
        })),
      });

      return dispatch;
    });

    const updated = await prisma.dispatch.findUnique({
      where:   { id: params.id },
      include: {
        items: {
          include: {
            unit:      { select: { serialNumber: true, finalAssemblyBarcode: true } },
            scannedBy: { select: { name: true } },
          },
        },
        order:        { select: { orderNumber: true, client: { select: { customerName: true } } } },
        dispatchedBy: { select: { name: true } },
        approvedBy:   { select: { name: true } },
      },
    });

    return NextResponse.json({ dispatch: updated });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (e instanceof Error && e.message === 'NOT_FOUND')
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });
    if (e instanceof Error && e.message === 'WRONG_STATUS')
      return NextResponse.json({ error: 'Dispatch is not in SUBMITTED state' }, { status: 400 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Invalid input' }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
