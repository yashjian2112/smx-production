import { NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/qc/units
 * Returns all units currently in QC_AND_SOFTWARE stage
 * (PENDING, IN_PROGRESS, WAITING_APPROVAL, REJECTED_BACK)
 * Only visible to PRODUCTION_EMPLOYEE, PRODUCTION_MANAGER, ADMIN
 */
export async function GET() {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'PRODUCTION_EMPLOYEE', 'QC_USER');

    const units = await prisma.controllerUnit.findMany({
      where: {
        currentStage: 'QC_AND_SOFTWARE',
        currentStatus: { in: ['PENDING', 'IN_PROGRESS', 'WAITING_APPROVAL', 'REJECTED_BACK'] },
      },
      select: {
        id: true,
        serialNumber: true,
        currentStatus: true,
        updatedAt: true,
        readyForDispatch: true,
        order: {
          select: {
            id: true,
            orderNumber: true,
            product: { select: { name: true, code: true } },
          },
        },
        assignments: {
          where: { stage: 'QC_AND_SOFTWARE' },
          select: { user: { select: { id: true, name: true } } },
          take: 1,
        },
        // QC barcode for this unit
        qcBarcode: true,
      },
      orderBy: [
        { currentStatus: 'asc' }, // IN_PROGRESS first
        { updatedAt: 'asc' },
      ],
    });

    return NextResponse.json(
      units.map((u) => ({
        ...u,
        updatedAt: u.updatedAt.toISOString(),
        assignedTo: u.assignments[0]?.user ?? null,
      }))
    );
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[qc/units]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
