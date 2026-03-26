import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { put } from '@vercel/blob';

const VENDOR_JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'smx-vendor-secret-change-in-prod'
);

// POST /api/vendor-portal/upload
// Vendor uploads files (quotation PDFs, images) — auth via token param OR vendor_session cookie
export async function POST(req: NextRequest) {
  // Try session cookie first
  let vendorId: string | null = null;
  const cookie = req.cookies.get('vendor_session')?.value;
  if (cookie) {
    try {
      const { payload } = await jwtVerify(cookie, VENDOR_JWT_SECRET);
      if (payload.type === 'vendor') vendorId = payload.vendorId as string;
    } catch { /* invalid cookie */ }
  }

  // Fallback: token in form data
  const formData = await req.formData();
  if (!vendorId) {
    const token = formData.get('token') as string | null;
    if (token) {
      const invite = await prisma.rFQVendorInvite.findUnique({ where: { token }, select: { vendorId: true } });
      if (invite) vendorId = invite.vendorId;
    }
  }

  if (!vendorId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > 20 * 1024 * 1024)
    return NextResponse.json({ error: 'File too large (max 20 MB)' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
  const path = `vendor-quotes/${vendorId}/${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const blob = await put(path, buf, { access: 'public', contentType: file.type });

  return NextResponse.json({ url: blob.url, name: file.name, size: file.size });
}
