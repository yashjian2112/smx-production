import { NextRequest } from 'next/server';

/**
 * Verify that a request comes from Vercel Cron.
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron invocations.
 */
export function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}
