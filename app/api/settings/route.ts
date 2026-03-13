import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { getAllSettings, upsertSetting, SETTING_DEFAULTS } from '@/lib/app-settings';
import { z } from 'zod';

export async function GET(_req: NextRequest) {
  try {
    await requireSession();
    const settings = await getAllSettings();
    return NextResponse.json(settings);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const patchSchema = z.record(z.string(), z.string());

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'ACCOUNTS');

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

    for (const [key, value] of Object.entries(parsed.data)) {
      if (key in SETTING_DEFAULTS) {
        await upsertSetting(key, value, session.id);
      }
    }

    const settings = await getAllSettings();
    return NextResponse.json(settings);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
