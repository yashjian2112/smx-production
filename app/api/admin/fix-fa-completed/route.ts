import { NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/admin/fix-fa-completed
 * One-shot migration: move all FINAL_ASSEMBLY + COMPLETED units to APPROVED
 * so they appear in the dispatch ready list.
 * ADMIN only.
 */
export async function POST() {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const result = await prisma.controllerUnit.updateMany({
      where: {
        currentStage:    'FINAL_ASSEMBLY',
        currentStatus:   'COMPLETED',
        readyForDispatch: false,
      },
      data: { currentStatus: 'APPROVED' },
    });

    return NextResponse.json({ fixed: result.count });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
