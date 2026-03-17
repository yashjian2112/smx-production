import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { put } from '@vercel/blob';

/**
 * POST /api/shipping/upload
 * Upload a photo (controller photo or box photo) to Vercel Blob.
 * Returns the blob URL.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'ACCOUNTS', 'SHIPPING', 'PACKING');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const type = (formData.get('type') as string | null) ?? 'controller';

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > 10 * 1024 * 1024)
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type))
      return NextResponse.json({ error: 'Only JPG, PNG or WEBP allowed' }, { status: 400 });

    const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `shipping/${type}/${session.id}/${Date.now()}.${ext}`;
    const buf  = Buffer.from(await file.arrayBuffer());

    const blob = await put(path, buf, { access: 'private', contentType: file.type });

    return NextResponse.json({ url: blob.url });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
