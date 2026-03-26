import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const rejectSchema = z.object({
  unitId:   z.string().min(1),
  issue:    z.string().min(1, 'Issue description is required'),
  photoUrl: z.string().url().optional(),
});

/**
 * POST /api/dispatch-orders/[id]/boxes/[boxId]/reject-unit
 * Reject a unit during packing inspection (marks/dents found).
 * Sets unit status → REJECTED_BACK, creates StageLog + ReworkRecord + TimelineLog.
 * The unit is NOT added to the box — it goes back for rework.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; boxId: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'SHIPPING', 'PACKING');

    const body = await req.json();
    const parsed = rejectSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { unitId, issue, photoUrl } = parsed.data;

    // Verify the dispatch order exists and is in the right state
    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where:  { id: params.id },
      select: { id: true, status: true, orderId: true },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'OPEN' && dispatchOrder.status !== 'PACKING')
      return NextResponse.json({ error: 'Dispatch order must be in OPEN or PACKING status' }, { status: 400 });

    // Verify the unit exists, belongs to this order, and is in the right state
    const unit = await prisma.controllerUnit.findUnique({
      where:  { id: unitId },
      select: { id: true, currentStage: true, currentStatus: true, orderId: true, packingBoxItem: { select: { id: true } } },
    });
    if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
    if (unit.orderId !== dispatchOrder.orderId)
      return NextResponse.json({ error: 'Unit does not belong to this order' }, { status: 400 });
    if (unit.currentStage !== 'FINAL_ASSEMBLY')
      return NextResponse.json({ error: 'Unit is not in FINAL_ASSEMBLY stage' }, { status: 400 });
    if (unit.packingBoxItem)
      return NextResponse.json({ error: 'Unit is already packed in a box — remove it first' }, { status: 400 });

    const prevStatus = unit.currentStatus;

    // Apply rejection in a transaction
    await prisma.$transaction([
      // 1. Change unit status to REJECTED_BACK
      prisma.controllerUnit.update({
        where: { id: unitId },
        data:  { currentStatus: 'REJECTED_BACK' },
      }),
      // 2. Stage log entry
      prisma.stageLog.create({
        data: {
          unitId,
          userId:     session.id,
          stage:      'FINAL_ASSEMBLY',
          statusFrom: prevStatus,
          statusTo:   'REJECTED_BACK',
          remarks:    `Packing inspection rejected: ${issue}${photoUrl ? ` [photo: ${photoUrl}]` : ''}`,
        },
      }),
      // 3. Rework record
      prisma.reworkRecord.create({
        data: {
          unitId,
          assignedUserId:  null,
          rootCauseStage:  'FINAL_ASSEMBLY',
          correctiveAction: `Packing inspection issue: ${issue}`,
          status:          'OPEN',
        },
      }),
      // 4. Timeline audit log
      prisma.timelineLog.create({
        data: {
          unitId,
          userId:     session.id,
          action:     'PACKING_INSPECTION_REJECTED',
          stage:      'FINAL_ASSEMBLY',
          statusFrom: prevStatus,
          statusTo:   'REJECTED_BACK',
          remarks:    issue,
          metadata:   JSON.stringify({ dispatchOrderId: params.id, boxId: params.boxId, photoUrl: photoUrl ?? null }),
        },
      }),
    ]);

    return NextResponse.json({ success: true, message: 'Unit rejected and sent back for rework' });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
