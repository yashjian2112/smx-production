import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';

// PATCH: update checklist item
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER');
    const { id } = await params;

    const contentType = req.headers.get('content-type') ?? '';
    let body: Record<string, string | null> = {};
    let referenceImageUrl: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('referenceImage') as File | null;
      body = Object.fromEntries(
        ['name', 'description', 'required', 'sortOrder', 'active', 'expectedCount',
         'orientationRule', 'boardLocation', 'isBoardReference', 'productId']
          .map((k) => [k, form.get(k) as string | null])
      );
      if (file && file.size > 0) {
        try {
          const blob = await put(`checklists/${Date.now()}-${file.name}`, file, {
            access: 'private',
            contentType: file.type || 'image/jpeg',
          });
          referenceImageUrl = blob.url;
        } catch (blobErr) {
          console.error('Blob upload error:', blobErr);
          return NextResponse.json({ error: 'Image upload failed — check BLOB_READ_WRITE_TOKEN env var' }, { status: 500 });
        }
      }
    } else {
      body = await req.json();
    }

    const data: Record<string, unknown> = {};
    if (body.name             != null)  data.name             = body.name;
    if (body.description      !== undefined) data.description  = body.description || null;
    if (body.required         != null)  data.required         = body.required !== 'false';
    if (body.sortOrder        != null)  data.sortOrder        = parseInt(body.sortOrder as string, 10) || 0;
    if (body.active           != null)  data.active           = body.active !== 'false';
    if (body.expectedCount    !== undefined) data.expectedCount = body.expectedCount ? parseInt(body.expectedCount as string, 10) : null;
    if (body.orientationRule  !== undefined) data.orientationRule = body.orientationRule || null;
    if (body.boardLocation    !== undefined) data.boardLocation   = body.boardLocation   || null;
    if (body.isBoardReference != null)  data.isBoardReference = body.isBoardReference === 'true';
    if ('productId' in body)            data.productId        = body.productId || null;
    if (referenceImageUrl)              data.referenceImageUrl = referenceImageUrl;

    const item = await prisma.stageChecklistItem.update({ where: { id }, data });
    return NextResponse.json(item);
  } catch (err) {
    console.error('Checklist PATCH error:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: remove checklist item
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER');
    const { id } = await params;
    await prisma.stageChecklistItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Checklist DELETE error:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
