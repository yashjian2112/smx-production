import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';

const COOKIE = 'smx_face_ok';
const MAX_AGE = 8 * 60 * 60; // 8 hours in seconds

/** Called after successful face scan — sets an 8-hour server cookie */
export async function POST() {
  try {
    const session = await requireSession();
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
