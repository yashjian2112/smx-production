import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/procurement/rfq/[id]/sample
// body: { quoteId, action: 'request' | 'approve' | 'reject' }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: rfqId } = await params;
  const { quoteId, action, notes } = await req.json() as { quoteId: string; action: string; notes?: string };

  if (!['request', 'approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const quote = await prisma.vendorQuote.findFirst({ where: { id: quoteId, rfqId } });
  if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

  const sampleStatus =
    action === 'request' ? 'REQUESTED' :
    action === 'approve' ? 'APPROVED'  : 'REJECTED';

  const updated = await prisma.vendorQuote.update({
    where: { id: quoteId },
    data: {
      sampleStatus,
      ...(action === 'request' ? { sampleRequestedAt: new Date(), sampleNotes: notes ?? null } : {}),
    },
  });

  return NextResponse.json({ sampleStatus: updated.sampleStatus, sampleRequestedAt: updated.sampleRequestedAt });
}
