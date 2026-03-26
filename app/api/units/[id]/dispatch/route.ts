import { NextRequest, NextResponse } from 'next/server';
import { UnitStatus } from '@prisma/client';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireSession();
  if (session.role === 'PRODUCTION_MANAGER') {
    return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
  }

  const { id } = await params;

  const unit = await prisma.controllerUnit.findUnique({
    where: { id },
    select: { id: true, currentStage: true, currentStatus: true, readyForDispatch: true },
  });

  if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
  if (unit.readyForDispatch) {
    return NextResponse.json({ error: 'Unit already dispatched' }, { status: 409 });
  }

  // Must be at Final Assembly and completed/approved
  const eligibleStatuses = ['COMPLETED', 'APPROVED'];
  if (
    unit.currentStage !== 'FINAL_ASSEMBLY' ||
    !eligibleStatuses.includes(unit.currentStatus)
  ) {
    return NextResponse.json(
      { error: 'Unit must be at Final Assembly (Completed/Approved) before dispatch' },
      { status: 400 },
    );
  }

  const updated = await prisma.controllerUnit.update({
    where: { id },
    data: { readyForDispatch: true },
  });

  await appendTimeline({
    unitId:   id,
    userId:   session.id,
    action:   'dispatched',
    stage:    'FINAL_ASSEMBLY',
    statusTo: unit.currentStatus as UnitStatus,
    remarks:  'Controller dispatched from production floor',
  });

  return NextResponse.json({ ok: true, readyForDispatch: updated.readyForDispatch });
}
