import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';

/**
 * GET /api/blob-image?url=<vercel-blob-url>
 *
 * Proxy for private Vercel Blob images.
 * Adds the server-side Bearer token so private blobs can be displayed
 * in the browser without exposing the token to the client.
 */
export async function GET(req: NextRequest) {
  try {
    await requireSession();

    const url = req.nextUrl.searchParams.get('url');
    if (!url || !url.includes('.blob.vercel-storage.com')) {
      return NextResponse.json({ error: 'Invalid blob URL' }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Blob not found' }, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return new NextResponse(res.body, {
      headers: {
        'content-type':  contentType,
        'cache-control': 'private, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
