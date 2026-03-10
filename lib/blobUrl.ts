/**
 * Convert a private Vercel Blob URL to a proxied URL safe for client-side display.
 * Local object URLs (blob:) and data URIs are returned as-is.
 */
export function blobImgUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (url.includes('.blob.vercel-storage.com')) {
    return `/api/blob-image?url=${encodeURIComponent(url)}`;
  }
  return url;
}
