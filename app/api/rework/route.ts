import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER', 'SALES', 'QC_USER');

    // 1. ReturnRequest items (replacement requests)
    const returns = await prisma.returnRequest.findMany({
      include: {
        client:      { select: { customerName: true, code: true } },
        reportedBy:  { select: { name: true } },
        evaluatedBy: { select: { name: true } },
        unit:        { select: { id: true, serialNumber: true, currentStage: true, currentStatus: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Standalone ReworkRecords (QC failures not linked to a ReturnRequest)
    const standaloneRework = await prisma.reworkRecord.findMany({
      where: { returnRequestId: null },
      include: {
        unit: {
          select: {
            id: true,
            serialNumber: true,
            currentStage: true,
            currentStatus: true,
            order: { select: { id: true, orderNumber: true, product: { select: { name: true, code: true } } } },
          },
        },
        assignedUser: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ returns, standaloneRework });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
