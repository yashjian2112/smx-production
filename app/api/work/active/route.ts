// GET /api/work/active
// Returns the currently logged-in employee's active (IN_PROGRESS) work submission
// Used by the scan page to show a "Resume Work" card when the employee already has
// an active session, eliminating the need to re-enter the serial number.

import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await requireSession();

    const active = await prisma.stageWorkSubmission.findFirst({
      where: {
        employeeId:     session.id,
        analysisStatus: 'IN_PROGRESS',
      },
      orderBy: { startedAt: 'desc' },
      include: {
        unit: {
          select: {
            id:            true,
            serialNumber:  true,
            currentStage:  true,
            currentStatus: true,
            product:       { select: { name: true, code: true } },
            order:         { select: { orderNumber: true } },
          },
        },
      },
    });

    return NextResponse.json({ active: active ?? null });
  } catch {
    return NextResponse.json({ active: null });
  }
}
