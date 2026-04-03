import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';

/**
 * POST /api/harness/accept-order
 * Accept all PENDING harness units in an order at once.
 * Body: { orderId: string }
 * harnessModel is already set on units from PI conversion.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'HARNESS_PRODUCTION');

    const { orderId } = (await req.json()) as { orderId: string };

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const pendingUnits = await prisma.harnessUnit.findMany({
      where: { orderId, status: 'PENDING' },
      select: { id: true },
    });

    if (pendingUnits.length === 0) {
      return NextResponse.json({ error: 'No pending units found for this order' }, { status: 400 });
    }

    const unitIds = pendingUnits.map(u => u.id);

    await prisma.harnessUnit.updateMany({
      where: { id: { in: unitIds } },
      data: {
        status: 'ACCEPTED',
        assignedUserId: session.id,
      },
    });

    await appendTimeline({
      orderId,
      userId: session.id,
      action: 'harness_accepted',
      remarks: `Accepted ${unitIds.length} harness units`,
    });

    return NextResponse.json({ accepted: unitIds.length });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[harness accept-order]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
