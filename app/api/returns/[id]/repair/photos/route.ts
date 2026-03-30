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
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    if (!['ADMIN', 'PRODUCTION_MANAGER', 'PRODUCTION_EMPLOYEE'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await req.formData();
    const outerFile = formData.get('outer') as File | null;
    const boardFile = formData.get('board') as File | null;

    if (!outerFile && !boardFile) {
      return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 });
    }

    const result: { outerUrl?: string; boardUrl?: string } = {};

    if (outerFile) {
      const blob = await put(
        `returns/${params.id}/outer.${getExt(outerFile)}`,
        outerFile,
        { access: 'public' }
      );
      result.outerUrl = blob.url;
    }

    if (boardFile) {
      const blob = await put(
        `returns/${params.id}/board.${getExt(boardFile)}`,
        boardFile,
        { access: 'public' }
      );
      result.boardUrl = blob.url;
    }

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message === 'Forbidden'))
      return NextResponse.json({ error: e.message }, { status: e.message === 'Unauthorized' ? 401 : 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
