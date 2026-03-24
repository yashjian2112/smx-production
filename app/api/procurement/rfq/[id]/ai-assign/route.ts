import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { aiAssignPO } from '@/lib/ai-po-assign';

// POST /api/procurement/rfq/[id]/ai-assign
// Triggers AI scoring + auto-creates PO + notifies admin
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const result = await aiAssignPO((await params).id, session.id);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
