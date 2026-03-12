import { prisma } from './prisma';
import { StageType, UnitStatus } from '@prisma/client';

type TimelineAction =
  | 'order_created'
  | 'serial_generated'
  | 'stage_assigned'
  | 'stage_started'
  | 'stage_completed'
  | 'submitted_for_approval'
  | 'approved'
  | 'rejected_back'
  | 'qc_passed'
  | 'qc_failed'
  | 'qc_rejected'
  | 'rework_opened'
  | 'rework_completed'
  | 'retest_passed'
  | 'final_assembly_completed'
  | 'unit_blocked'
  | 'status_changed'
  | 'assembly_pairing_recorded';

export async function appendTimeline(params: {
  unitId?: string | null;
  orderId?: string | null;
  userId?: string | null;
  action: TimelineAction;
  stage?: StageType | null;
  statusFrom?: UnitStatus | null;
  statusTo?: UnitStatus | null;
  remarks?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await prisma.timelineLog.create({
    data: {
      unitId: params.unitId ?? undefined,
      orderId: params.orderId ?? undefined,
      userId: params.userId ?? undefined,
      action: params.action,
      stage: params.stage ?? undefined,
      statusFrom: params.statusFrom ?? undefined,
      statusTo: params.statusTo ?? undefined,
      remarks: params.remarks ?? undefined,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    },
  });
}
