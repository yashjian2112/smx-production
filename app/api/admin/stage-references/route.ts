import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';

// GET: list all stage reference images (optionally filtered by productId)
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');
    const productId = req.nextUrl.searchParams.get('productId');
    const refs = await prisma.stageReference.findMany({
      where: productId ? { productId } : undefined,
      include: { product: { select: { code: true, name: true } } },
      orderBy: [{ stage: 'asc' }, { createdAt: 'desc' }],
    });
    return NextResponse.json(refs);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// POST: upload/upsert reference image for product+stage
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const form = await req.formData();
    const productId = form.get('productId') as string;
    const stage = form.get('stage') as string;
    const file = form.get('image') as File | null;

    if (!productId || !stage || !file) {
      return NextResponse.json({ error: 'productId, stage, and image are required' }, { status: 400 });
    }

    // Upload to Vercel Blob
    const blob = await put(`stage-references/${productId}/${stage}.jpg`, file, {
      access: 'public',
      contentType: file.type || 'image/jpeg',
    });

    // Upsert — one reference per product+stage
    const ref = await prisma.stageReference.upsert({
      where: { productId_stage: { productId, stage: stage as never } },
      create: { productId, stage: stage as never, imageUrl: blob.url },
      update: { imageUrl: blob.url },
    });

    return NextResponse.json(ref);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
