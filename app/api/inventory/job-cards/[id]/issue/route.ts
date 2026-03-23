// This route is deprecated — replaced by /dispatch
// Kept to avoid 404s from any lingering references
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Use /dispatch instead' }, { status: 410 });
}
