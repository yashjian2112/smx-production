import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { descriptorDistanceServer, FACE_MATCH_THRESHOLD } from '@/lib/face-verify-server';

const COOKIE = 'smx_face_ok';
const MAX_AGE = 4 * 60 * 60; // 4 hours — shorter for better security

// Simple in-memory rate limit: userId -> { count, resetAt }
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 15; // max attempts per window

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimit.get(userId);
  if (!entry) {
    rateLimit.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now > entry.resetAt) {
    rateLimit.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

/** Server-side face verification: client sends live descriptor, we compare to stored. Cookie only if match. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    if (!checkRateLimit(session.id)) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again in 15 minutes.' },
        { status: 429 }
      );
    }

    let body: { descriptor?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
    }

    const descriptorJson = body.descriptor;
    if (!descriptorJson || typeof descriptorJson !== 'string') {
      return NextResponse.json({ error: 'descriptor required' }, { status: 400 });
    }

    let liveArr: number[];
    try {
      liveArr = JSON.parse(descriptorJson);
    } catch {
      return NextResponse.json({ error: 'Invalid descriptor format' }, { status: 400 });
    }
    if (!Array.isArray(liveArr) || liveArr.length !== 128) {
      return NextResponse.json({ error: 'Descriptor must be 128 numbers' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { faceDescriptor: true, faceEnrolled: true },
    });

    if (!user?.faceEnrolled || !user.faceDescriptor) {
      return NextResponse.json({ error: 'Face not enrolled' }, { status: 403 });
    }

    let storedArr: number[];
    try {
      storedArr = JSON.parse(user.faceDescriptor);
    } catch {
      return NextResponse.json({ error: 'Invalid stored descriptor' }, { status: 500 });
    }
    if (!Array.isArray(storedArr) || storedArr.length !== 128) {
      return NextResponse.json({ error: 'Invalid stored descriptor' }, { status: 500 });
    }

    const distance = descriptorDistanceServer(liveArr, storedArr);
    if (distance >= FACE_MATCH_THRESHOLD) {
      return NextResponse.json({ error: 'Face not recognised', distance }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: MAX_AGE,
      path: '/',
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

/** Called on logout — clears the face cookie */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
