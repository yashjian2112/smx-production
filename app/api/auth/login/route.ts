import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword, createSession } from '@/lib/auth';
import { cookies } from 'next/headers';

// In-memory brute-force protection: tracks failed attempts per IP
// Resets on server restart — good enough for Vercel serverless
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const now = Date.now();

    // Check lockout
    const attempt = failedAttempts.get(ip);
    if (attempt && attempt.lockedUntil > now) {
      const minutesLeft = Math.ceil((attempt.lockedUntil - now) / 60000);
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { email, password } = body as { email?: string; password?: string };
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || !user.active) {
      // Count failed attempt
      const cur = failedAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
      const newCount = cur.count + 1;
      failedAttempts.set(ip, {
        count: newCount,
        lockedUntil: newCount >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0,
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      // Count failed attempt
      const cur = failedAttempts.get(ip) ?? { count: 0, lockedUntil: 0 };
      const newCount = cur.count + 1;
      failedAttempts.set(ip, {
        count: newCount,
        lockedUntil: newCount >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0,
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Success — clear failed attempts for this IP
    failedAttempts.delete(ip);

    const token = await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    const cookieStore = await cookies();
    cookieStore.set('smx_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
