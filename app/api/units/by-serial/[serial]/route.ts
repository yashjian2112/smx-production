import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ serial: string }> }
) {
  try {
    await requireSession();
    const serial = decodeURIComponent((await params).serial).toUpperCase().trim();
    const unit = await prisma.controllerUnit.findUnique({
      where: { serialNumber: serial },
      include: {
        order: { include: { product: true } },
        product: true,
        assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
        stageLogs: { include: { user: true, approvedBy: true }, orderBy: { createdAt: 'desc' }, take: 50 },
        qcRecords: { include: { user: true, issueCategory: true }, orderBy: { createdAt: 'desc' } },
        reworkRecords: { include: { assignedUser: true, rootCauseCategory: true }, orderBy: { createdAt: 'desc' } },
        timelineLogs: { include: { user: true }, orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!unit) return NextResponse.json({ error: 'Controller not found' }, { status: 404 });
    return NextResponse.json(unit);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
