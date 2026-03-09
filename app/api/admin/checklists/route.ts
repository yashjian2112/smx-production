import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';

// GET: list all checklist items grouped by stage
export async function GET(req: NextRequest) {
  await requireSession();
  const items = await prisma.stageChecklistItem.findMany({
    orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json(items);
}

// POST: create new checklist item (admin only)
export async function POST(req: NextRequest) {
  const session = await requireSession();
  requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER');

  const contentType = req.headers.get('content-type') ?? '';
  let body: Record<string, string> = {};
  let referenceImageUrl: string | undefined;

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('referenceImage') as File | null;
    body = {
      stage:           form.get('stage')           as string,
      name:            form.get('name')             as string,
      description:     (form.get('description')     as string) ?? '',
      required:        (form.get('required')         as string) ?? 'true',
      sortOrder:       (form.get('sortOrder')        as string) ?? '0',
      expectedCount:   (form.get('expectedCount')   as string) ?? '',
      orientationRule: (form.get('orientationRule') as string) ?? '',
      boardLocation:   (form.get('boardLocation')   as string) ?? '',
      isBoardReference:(form.get('isBoardReference') as string) ?? 'false',
    };
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

  const item = await prisma.stageChecklistItem.create({
    data: {
      stage:            body.stage as never,
      name:             body.name,
      description:      body.description || null,
      referenceImageUrl: referenceImageUrl ?? null,
      expectedCount:    body.expectedCount ? parseInt(body.expectedCount, 10) : null,
      orientationRule:  body.orientationRule || null,
      boardLocation:    body.boardLocation   || null,
      isBoardReference: body.isBoardReference === 'true',
      required:         body.required !== 'false',
      sortOrder:        parseInt(body.sortOrder ?? '0', 10) || 0,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
