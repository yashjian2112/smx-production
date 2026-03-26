import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';

// GET: list all checklist items (optionally filtered by productId)
export async function GET(req: NextRequest) {
  await requireSession();
  const productId = req.nextUrl.searchParams.get('productId');
  const items = await prisma.stageChecklistItem.findMany({
    where: productId ? { productId } : undefined,
    orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json(items);
}

// POST: create new checklist item (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const contentType = req.headers.get('content-type') ?? '';
    let body: Record<string, string | null> = {};
    let referenceImageUrl: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('referenceImage') as File | null;
      body = {
        stage:           form.get('stage')           as string,
        productId:       form.get('productId')        as string | null,
        name:            form.get('name')             as string,
        description:     (form.get('description')     as string) ?? '',
        required:        (form.get('required')         as string) ?? 'true',
        sortOrder:       (form.get('sortOrder')        as string) ?? '0',
        expectedCount:   (form.get('expectedCount')   as string) ?? '',
        orientationRule: (form.get('orientationRule') as string) ?? '',
        boardLocation:       (form.get('boardLocation')       as string) ?? '',
        componentPositions:  (form.get('componentPositions')  as string) ?? '',
        photoZone:           (form.get('photoZone')           as string) ?? '',
        isBoardReference:    (form.get('isBoardReference')    as string) ?? 'false',
      };
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

    const isBoardRef = body.isBoardReference === 'true';

    // For board reference items: upsert (one per stage+product combo)
    if (isBoardRef) {
      const existing = await prisma.stageChecklistItem.findFirst({
        where: {
          stage: body.stage as never,
          isBoardReference: true,
          productId: body.productId || null,
        },
      });
      if (existing) {
        // Update the existing board reference with the new image
        const updated = await prisma.stageChecklistItem.update({
          where: { id: existing.id },
          data: { referenceImageUrl: referenceImageUrl ?? existing.referenceImageUrl },
        });
        return NextResponse.json(updated, { status: 200 });
      }
    }

    const item = await prisma.stageChecklistItem.create({
      data: {
        stage:            body.stage as never,
        productId:        body.productId || null,
        name:             body.name as string,
        description:      body.description || null,
        referenceImageUrl: referenceImageUrl ?? null,
        expectedCount:    body.expectedCount ? parseInt(body.expectedCount as string, 10) : null,
        orientationRule:  body.orientationRule || null,
        boardLocation:       body.boardLocation       || null,
        componentPositions:  body.componentPositions  || null,
        photoZone:           body.photoZone           || null,
        isBoardReference: isBoardRef,
        required:         body.required !== 'false',
        sortOrder:        parseInt((body.sortOrder ?? '0') as string, 10) || 0,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    console.error('Checklist POST error:', err);
    const msg = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
