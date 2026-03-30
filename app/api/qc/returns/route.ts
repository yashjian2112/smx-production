import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Returns pending QC check (status = QC_CHECKED, submitted by employee for QC review)
export async function GET() {
  try {
    const session = await requireSession();
    if (!['ADMIN', 'PRODUCTION_MANAGER', 'QC_USER'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const returns = await prisma.returnRequest.findMany({
      where: { status: 'QC_CHECKED' },
      orderBy: { updatedAt: 'asc' },
      select: {
        id:            true,
        returnNumber:  true,
        serialNumber:  true,
        reportedIssue: true,
        updatedAt:     true,
        client: { select: { customerName: true, code: true } },
      },
    });

    return NextResponse.json(returns.map(r => ({
      ...r,
      updatedAt: r.updatedAt.toISOString(),
    })));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
