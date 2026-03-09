import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';

// PATCH: update checklist item
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER');
  const { id } = await params;

  const contentType = req.headers.get('content-type') ?? '';
  let body: Record<string, string> = {};
  let referenceImageUrl: string | undefined;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('referenceImage') as File | null;
    body = Object.fromEntries(
      ['name', 'description', 'required', 'sortOrder', 'active', 'expectedCount', 'orientationRule', 'isBoardReference']
        .map((k) => [k, form.get(k) as string])
    );
    if (file && file.size > 0) {
      const blob = await put(`checklists/${Date.now()}-${file.name}`, file, {
        access: 'public',
        contentType: file.type || 'image/jpeg',
      });
      referenceImageUrl = blob.url;
    }
  } else {
    body = await req.json();
  }

  const data: Record<string, unknown> = {};
  if (body.name             !== undefined) data.name             = body.name;
  if (body.description      !== undefined) data.description      = body.description || null;
  if (body.required         !== undefined) data.required         = body.required !== 'false';
  if (body.sortOrder        !== undefined) data.sortOrder        = parseInt(body.sortOrder, 10) || 0;
  if (body.active           !== undefined) data.active           = body.active !== 'false';
  if (body.expectedCount    !== undefined) data.expectedCount    = body.expectedCount ? parseInt(body.expectedCount, 10) : null;
  if (body.orientationRule  !== undefined) data.orientationRule  = body.orientationRule || null;
  if (body.isBoardReference !== undefined) data.isBoardReference = body.isBoardReference === 'true';
  if (referenceImageUrl) data.referenceImageUrl = referenceImageUrl;

  const item = await prisma.stageChecklistItem.update({ where: { id }, data });
  return NextResponse.json(item);
}

// DELETE: remove checklist item
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER');
  const { id } = await params;
  await prisma.stageChecklistItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
