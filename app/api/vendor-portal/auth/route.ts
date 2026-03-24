import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const VENDOR_JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? 'smx-vendor-secret-change-in-prod'
);

// POST /api/vendor-portal/auth — vendor login
export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 });

  const vendor = await prisma.vendor.findUnique({
    where: { portalEmail: email.toLowerCase().trim() },
  });

  if (!vendor || !vendor.portalPassword || !vendor.isPortalActive) {
    return NextResponse.json({ error: 'Invalid credentials or account not active' }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, vendor.portalPassword);
  if (!valid) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

  // Issue vendor JWT (1 day)
  const token = await new SignJWT({ vendorId: vendor.id, vendorCode: vendor.code, type: 'vendor' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1d')
    .sign(VENDOR_JWT_SECRET);

  const res = NextResponse.json({ vendorId: vendor.id, name: vendor.name, code: vendor.code });
  res.cookies.set('vendor_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400,
    path: '/',
  });
  return res;
}

// DELETE /api/vendor-portal/auth — vendor logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete('vendor_session');
  return res;
}
