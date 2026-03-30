import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// GET — full return request detail
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!['ADMIN', 'SALES', 'ACCOUNTS', 'PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;

  const ret = await prisma.returnRequest.findUnique({
    where: { id },
    include: {
      client:      { select: { code: true, customerName: true } },
      unit:        { select: { id: true, serialNumber: true, currentStage: true, currentStatus: true, product: { select: { name: true, code: true } } } },
      order:       { select: { id: true, orderNumber: true } },
      reportedBy:  { select: { id: true, name: true } },
      evaluatedBy: { select: { id: true, name: true } },
      repairLogs:  { include: { employee: { select: { id: true, name: true } } }, orderBy: { startedAt: 'desc' } },
    },
  });
  if (!ret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    ...ret,
    createdAt: ret.createdAt.toISOString(),
    updatedAt: ret.updatedAt.toISOString(),
  });
}

// DELETE — remove return request (only before IN_REPAIR)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (!['ADMIN', 'SALES'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;

    const ret = await prisma.returnRequest.findUnique({ where: { id } });
    if (!ret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const locked = ['IN_REPAIR', 'REPAIRED', 'QC_CHECKED', 'DISPATCHED', 'CLOSED'];
    if (locked.includes(ret.status)) {
      return NextResponse.json({ error: 'Cannot delete after inspection has started' }, { status: 400 });
    }

    await prisma.returnRequest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[returns/[id] DELETE]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH — evaluate or update status
const patchSchema = z.object({
  // Edit fields (before IN_REPAIR)
  serialNumber:    z.string().min(1).optional(),
  reportedIssue:   z.string().min(1).optional(),
  clientId:        z.string().min(1).optional(),
  // Evaluation fields
  evaluationNotes: z.string().optional(),
  resolution:      z.enum(['REPAIR', 'REPLACE', 'REFUND', 'CREDIT_NOTE']).optional(),
  // Status transition
  status:          z.enum([
    'REPORTED', 'EVALUATED', 'APPROVED', 'UNIT_RECEIVED',
    'IN_REPAIR', 'REPAIRED', 'QC_CHECKED', 'DISPATCHED', 'CLOSED', 'REJECTED',
  ]).optional(),
}).refine(d => d.serialNumber || d.reportedIssue || d.clientId || d.evaluationNotes || d.resolution || d.status, {
  message: 'At least one field required',
});

// Valid status transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  REPORTED:      ['EVALUATED', 'REJECTED'],
  EVALUATED:     ['APPROVED', 'REJECTED'],
  APPROVED:      ['UNIT_RECEIVED', 'IN_REPAIR'],
  UNIT_RECEIVED: ['IN_REPAIR'],
  IN_REPAIR:     ['REPAIRED'],
  REPAIRED:      ['QC_CHECKED', 'CLOSED'],
  QC_CHECKED:    ['DISPATCHED', 'CLOSED'],
  DISPATCHED:    ['CLOSED'],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }

    const ret = await prisma.returnRequest.findUnique({ where: { id } });
    if (!ret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    // Edit base fields (only before IN_REPAIR)
    const locked = ['IN_REPAIR', 'REPAIRED', 'QC_CHECKED', 'DISPATCHED', 'CLOSED'];
    if (data.serialNumber || data.reportedIssue || data.clientId) {
      if (locked.includes(ret.status)) {
        return NextResponse.json({ error: 'Cannot edit after inspection has started' }, { status: 400 });
      }
      if (!['ADMIN', 'SALES'].includes(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (data.serialNumber)  updateData.serialNumber  = data.serialNumber;
      if (data.reportedIssue) updateData.reportedIssue = data.reportedIssue;
      if (data.clientId)      updateData.clientId      = data.clientId;
    }

    // Evaluation (by admin/manager/employee)
    if (data.evaluationNotes !== undefined) {
      updateData.evaluationNotes = data.evaluationNotes;
      updateData.evaluatedById = session.id;
    }
    if (data.resolution !== undefined) {
      updateData.resolution = data.resolution;
    }

    // Status transition
    if (data.status) {
      const allowed = VALID_TRANSITIONS[ret.status] ?? [];
      if (!allowed.includes(data.status)) {
        return NextResponse.json({
          error: `Cannot transition from ${ret.status} to ${data.status}`,
        }, { status: 400 });
      }
      updateData.status = data.status;

      // Auto-set evaluatedById on EVALUATED
      if (data.status === 'EVALUATED' && !updateData.evaluatedById) {
        updateData.evaluatedById = session.id;
      }
    }

    const updated = await prisma.returnRequest.update({
      where: { id },
      data: updateData,
      include: {
        client:      { select: { code: true, customerName: true } },
        reportedBy:  { select: { id: true, name: true } },
        evaluatedBy: { select: { id: true, name: true } },
        repairLogs:  { include: { employee: { select: { id: true, name: true } } }, orderBy: { startedAt: 'desc' } },
      },
    });

    return NextResponse.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[returns/[id] PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
