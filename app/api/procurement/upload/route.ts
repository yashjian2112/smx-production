import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { put } from '@vercel/blob';

/**
 * POST /api/procurement/upload
 * Upload RFQ drawings, spec sheets, or vendor documents to Vercel Blob.
 * Allowed: ADMIN, PURCHASE_MANAGER, INVENTORY_MANAGER
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER');

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > 20 * 1024 * 1024)
      return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 400 });

    const ext  = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const path = `procurement/${session.id}/${Date.now()}.${ext}`;
    const buf  = Buffer.from(await file.arrayBuffer());

    const blob = await put(path, buf, { access: 'public', contentType: file.type });

    return NextResponse.json({ url: blob.url, name: file.name, size: file.size });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
