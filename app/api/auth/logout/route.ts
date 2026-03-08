import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete('smx_session');
  // Also clear face verification cookie so next user must re-verify
  cookieStore.delete('smx_face_ok');
  return NextResponse.json({ ok: true });
}
