import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { put } from '@vercel/blob';

function getExt(file: File): string {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return 'jpg';
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    if (!['ADMIN', 'PRODUCTION_MANAGER', 'PRODUCTION_EMPLOYEE'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const outerFile = formData.get('outer') as File | null;
    const boardFile = formData.get('board') as File | null;
    const afterFile = formData.get('after') as File | null;
    const topFile   = formData.get('top')   as File | null;
    const bbFile    = formData.get('bb')    as File | null;
    const psFile    = formData.get('ps')    as File | null;

    if (!outerFile && !boardFile && !afterFile && !topFile && !bbFile && !psFile) {
      return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 });
    }

    const result: Record<string, string> = {};

    const uploads: [File | null, string, string][] = [
      [outerFile, 'outer',  'outerUrl'],
      [boardFile, 'board',  'boardUrl'],
      [afterFile, 'after',  'afterUrl'],
      [topFile,   'top',    'topUrl'],
      [bbFile,    'bb',     'bbUrl'],
      [psFile,    'ps',     'psUrl'],
    ];

    for (const [file, name, key] of uploads) {
      if (file) {
        const blob = await put(
          `returns/${id}/${name}.${getExt(file)}`,
          file,
          { access: 'public' }
        );
        result[key] = blob.url;
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message === 'Forbidden'))
      return NextResponse.json({ error: e.message }, { status: e.message === 'Unauthorized' ? 401 : 403 });
    console.error('[repair/photos]', e);
    const msg = e instanceof Error ? e.message : 'Server error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
