import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** PATCH /api/admin/harness-connectors/[id] — update a connector */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.description !== undefined) data.description = body.description?.trim() || null;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    if (body.active !== undefined) data.active = body.active;
    if (body.variantName !== undefined) data.variantName = body.variantName?.trim() || null;

    const connector = await prisma.harnessConnector.update({ where: { id }, data });
    return NextResponse.json(connector);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[harness-connectors PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/admin/harness-connectors/[id] — soft-delete (set active=false) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');
    const { id } = await params;
    await prisma.harnessConnector.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[harness-connectors DELETE]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
