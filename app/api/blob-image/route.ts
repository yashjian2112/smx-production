import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/blob-image?url=<vercel-blob-url>
 *
 * Proxy for private Vercel Blob images.
 * No session check here — the Next.js image optimizer makes server-to-server
 * requests that don't carry session cookies, so we rely on:
 *   1. The BLOB_READ_WRITE_TOKEN (server-side only, never exposed to browser)
 *   2. The URL being a non-guessable private blob path
 */
export async function GET(req: NextRequest) {
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
}
