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

    if (!outerFile && !boardFile && !afterFile) {
      return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 });
    }

    const result: { outerUrl?: string; boardUrl?: string; afterUrl?: string } = {};

    if (outerFile) {
      const blob = await put(
        `returns/${id}/outer.${getExt(outerFile)}`,
        outerFile,
        { access: 'public' }
      );
      result.outerUrl = blob.url;
    }

    if (boardFile) {
      const blob = await put(
        `returns/${id}/board.${getExt(boardFile)}`,
        boardFile,
        { access: 'public' }
      );
      result.boardUrl = blob.url;
    }

    if (afterFile) {
      const blob = await put(
        `returns/${id}/after.${getExt(afterFile)}`,
        afterFile,
        { access: 'public' }
      );
      result.afterUrl = blob.url;
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message === 'Forbidden'))
      return NextResponse.json({ error: e.message }, { status: e.message === 'Unauthorized' ? 401 : 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
