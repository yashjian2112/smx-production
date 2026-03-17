import { NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// One-shot endpoint: adds PACKING value to the Role enum in the live DB
// Call once as ADMIN: GET /api/admin/migrate-packing-role
export async function GET() {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    // Check if PACKING already exists in the enum
    const result = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'Role' AND e.enumlabel = 'PACKING'
      ) AS exists
    `;

    if (result[0]?.exists) {
      return NextResponse.json({ message: 'PACKING role already exists in enum — nothing to do' });
    }

    // Add PACKING to the Role enum
    await prisma.$executeRaw`ALTER TYPE "Role" ADD VALUE 'PACKING'`;

    return NextResponse.json({ message: 'PACKING role added to Role enum successfully' });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
