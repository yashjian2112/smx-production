import { prisma } from './prisma';

/**
 * Ensures the PACKING value exists in the Role enum.
 * Safe to call on every request — no-ops if already present.
 * Required because Vercel builds run `prisma generate` (not `db push`),
 * so new enum values must be added to the live DB manually.
 */
export async function ensurePackingRole() {
  try {
    const res = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'Role' AND e.enumlabel = 'PACKING'
      ) AS exists
    `;
    if (!res[0]?.exists) {
      await prisma.$executeRaw`ALTER TYPE "Role" ADD VALUE 'PACKING'`;
    }
  } catch {
    // Non-fatal — if it fails the subsequent DB write will surface the real error
  }
}
