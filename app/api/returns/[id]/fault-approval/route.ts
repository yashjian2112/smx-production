import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  action: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().optional(),
});

/**
 * PATCH /api/returns/[id]/fault-approval
 * Sales or Admin approves/rejects customer damage finding.
 * Only relevant when faultType=CUSTOMER_DAMAGE and faultApproval=PENDING.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (!['ADMIN', 'SALES'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = await params;

    const ret = await prisma.returnRequest.findUnique({
      where: { id },
      select: { id: true, faultType: true, faultApproval: true },
    });
    if (!ret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (ret.faultType !== 'CUSTOMER_DAMAGE') {
      return NextResponse.json({ error: 'Not a customer damage case' }, { status: 400 });
    }
    if (ret.faultApproval !== 'PENDING') {
      return NextResponse.json({ error: 'Already processed' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });
    }

    const updated = await prisma.returnRequest.update({
      where: { id },
      data: {
        faultApproval:     parsed.data.action,
        faultApprovedById: session.id,
        ...(parsed.data.reason ? { evaluationNotes: parsed.data.reason } : {}),
      },
    });

    return NextResponse.json({
      faultApproval:   updated.faultApproval,
      faultApprovedBy: session.id,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[returns/[id]/fault-approval]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
