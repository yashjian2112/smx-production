import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/inventory/job-cards/[id]/complete
// Marks a job card as COMPLETED — called when manufacturing work is done.
// Allowed by: PRODUCTION_MANAGER, PRODUCTION_MANAGER, ADMIN

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (!['PRODUCTION_MANAGER', 'ADMIN'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const notes: string | undefined = body.notes;

  const jobCard = await prisma.jobCard.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!jobCard) return NextResponse.json({ error: 'Job card not found' }, { status: 404 });

  // Can only complete from IN_PROGRESS or DISPATCHED
  if (!['IN_PROGRESS', 'DISPATCHED'].includes(jobCard.status)) {
    return NextResponse.json(
      { error: `Cannot complete a job card with status ${jobCard.status}` },
      { status: 400 }
    );
  }

  const updated = await prisma.jobCard.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      ...(notes ? { notes } : {}),
    },
    include: {
      order:       { select: { orderNumber: true } },
      createdBy:   { select: { name: true } },
      dispatchedBy: { select: { name: true } },
      items: {
        include: {
          rawMaterial: { select: { id: true, name: true, code: true, unit: true, barcode: true } }
        }
      }
    }
  });

  return NextResponse.json(updated);
}
