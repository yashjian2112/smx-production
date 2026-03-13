/**
 * Verifies the Bearer token on incoming requests from Google Apps Script.
 * Set SHEET_API_TOKEN in your environment variables (Vercel + .env).
 */
export function verifySheetToken(request: Request): boolean {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const expected = process.env.SHEET_API_TOKEN ?? '';
  return expected.length > 0 && token === expected;
}
