import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET — list all notes for an order
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'SALES', 'ACCOUNTS', 'PRODUCTION_MANAGER');
    const { id } = await params;

    const notes = await prisma.orderNote.findMany({
      where: { orderId: id },
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(notes);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST — add a note
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'SALES', 'ACCOUNTS', 'PRODUCTION_MANAGER');
    const { id } = await params;

    const { content } = await req.json() as { content?: string };
    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 });
    }

    // Verify order exists
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const note = await prisma.orderNote.create({
      data: {
        orderId:  id,
        content:  content.trim(),
        authorId: session.id,
        role:     session.role,
      },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json(note, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
