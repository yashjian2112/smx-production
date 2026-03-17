import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ensurePackingRole } from '@/lib/db-migrations';
import { z } from 'zod';

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'PRODUCTION_MANAGER', 'PRODUCTION_EMPLOYEE', 'PACKING', 'SALES', 'ACCOUNTS', 'SHIPPING', 'PURCHASE_MANAGER', 'STORE_MANAGER']),
});

export async function GET() {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(users);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    }
    const { email, password, name, role } = parsed.data;

    // Ensure PACKING enum value exists in live DB before writing
    await ensurePackingRole();

    const existing = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        passwordHash,
        name,
        role,
      },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    return NextResponse.json(user);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
