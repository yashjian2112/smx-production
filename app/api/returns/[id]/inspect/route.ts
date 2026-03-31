import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { StageType } from '@prisma/client';

const schema = z.object({
  faultType:            z.enum(['MANUFACTURING_DEFECT', 'CUSTOMER_DAMAGE']),
  blameStage:           z.nativeEnum(StageType).optional(),
  topPhotoUrl:          z.string().optional(),
  bbInspectionPhotoUrl: z.string().optional(),
  psInspectionPhotoUrl: z.string().optional(),
});

/**
 * POST /api/returns/[id]/inspect
 * Production user submits fault determination after inspecting the unit.
 * - MANUFACTURING_DEFECT: auto-lookup blame employee, no approval needed
 * - CUSTOMER_DAMAGE: sets faultApproval=PENDING, needs Sales/Admin approval
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (!['ADMIN', 'PRODUCTION_MANAGER', 'PRODUCTION_EMPLOYEE'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;

    const ret = await prisma.returnRequest.findUnique({
      where: { id },
      select: { id: true, status: true, unitId: true, faultType: true },
    });
    if (!ret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (ret.faultType) {
      return NextResponse.json({ error: 'Fault type already determined' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {
      faultType:            data.faultType,
      topPhotoUrl:          data.topPhotoUrl ?? null,
      bbInspectionPhotoUrl: data.bbInspectionPhotoUrl ?? null,
      psInspectionPhotoUrl: data.psInspectionPhotoUrl ?? null,
    };

    if (data.faultType === 'MANUFACTURING_DEFECT') {
      updateData.faultApproval = 'APPROVED'; // no approval gate
      updateData.blameStage = data.blameStage ?? null;

      // Auto-lookup who worked on the blamed stage
      if (data.blameStage && ret.unitId) {
        const assignment = await prisma.stageAssignment.findFirst({
          where: { unitId: ret.unitId, stage: data.blameStage },
          orderBy: { assignedAt: 'desc' },
          select: { userId: true, assignedAt: true },
        });
        if (assignment) {
          updateData.blameEmployeeId = assignment.userId;
          updateData.blameDate = assignment.assignedAt;
        }
      }
    } else {
      // CUSTOMER_DAMAGE — needs approval from Sales or Admin
      updateData.faultApproval = 'PENDING';
    }

    const updated = await prisma.returnRequest.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      faultType:     updated.faultType,
      faultApproval: updated.faultApproval,
      blameStage:    updated.blameStage,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[returns/[id]/inspect]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
