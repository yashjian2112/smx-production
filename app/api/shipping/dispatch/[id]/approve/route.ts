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
 * On approve: marks all units readyForDispatch=true + timeline logs.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS');

    const body = approveSchema.parse(await req.json());

    const dispatch = await prisma.dispatch.findUnique({
      where:   { id: params.id },
      include: {
        items: { select: { id: true, unitId: true, serial: true } },
        order: { select: { id: true, orderNumber: true } },
      },
    });
    if (!dispatch) return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });
    if (dispatch.status !== 'SUBMITTED')
      return NextResponse.json({ error: 'Dispatch is not in SUBMITTED state' }, { status: 400 });

    if (body.action === 'reject') {
      if (!body.rejectedReason?.trim())
        return NextResponse.json({ error: 'Rejection reason is required.' }, { status: 400 });

      const updated = await prisma.dispatch.update({
        where: { id: params.id },
        data: { status: 'REJECTED', rejectedReason: body.rejectedReason },
      });
      return NextResponse.json({ dispatch: updated });
    }

    // APPROVE — mark all units as dispatched + timeline logs
    const now = new Date();

    await prisma.$transaction([
      // Mark dispatch approved
      prisma.dispatch.update({
        where: { id: params.id },
        data:  { status: 'APPROVED', approvedById: session.id, approvedAt: now },
      }),
      // Mark each unit as readyForDispatch
      prisma.controllerUnit.updateMany({
        where: { id: { in: dispatch.items.map((i) => i.unitId) } },
        data:  { readyForDispatch: true },
      }),
      // Timeline logs for each unit
      ...dispatch.items.map((item) =>
        prisma.timelineLog.create({
          data: {
            unitId:   item.unitId,
            orderId:  dispatch.order.id,
            userId:   session.id,
            action:   'dispatched',
            stage:    'FINAL_ASSEMBLY',
            statusTo: 'APPROVED',
            remarks:  `Dispatched via ${dispatch.dispatchNumber}. Order #${dispatch.order.orderNumber}.`,
            metadata: JSON.stringify({ dispatchId: params.id, dispatchNumber: dispatch.dispatchNumber }),
          },
        })
      ),
    ]);

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
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: e.errors[0]?.message ?? 'Invalid input' }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
