import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/procurement/requirement-orders/[id]/approve — IM approves RO
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ro = await prisma.requirementOrder.findUnique({ where: { id: (await params).id } });
  if (!ro) return NextResponse.json({ error: 'RO not found' }, { status: 404 });
  if (ro.status !== 'PENDING') return NextResponse.json({ error: `Cannot approve RO in status ${ro.status}` }, { status: 400 });

  // Accept optional approval notes from IM
  let approvalNotes: string | undefined;
  try {
    const body = await req.json();
    approvalNotes = body.approvalNotes;
  } catch { /* no body is fine */ }

  const updatedNotes = approvalNotes
    ? (ro.notes ? `${ro.notes}\n\nIM Approval: ${approvalNotes}` : `IM Approval: ${approvalNotes}`)
    : ro.notes;

  const updated = await prisma.requirementOrder.update({
    where: { id: (await params).id },
    data: {
      status: 'APPROVED',
      approvedById: session.id,
      approvedAt: new Date(),
      notes: updatedNotes,
    },
    include: {
      items: { include: { material: { select: { id: true, name: true, unit: true } } } },
      approvedBy: { select: { name: true } },
    },
  });

  return NextResponse.json(updated);
}
