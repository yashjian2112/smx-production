import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole, hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ensurePackingRole } from '@/lib/db-migrations';
import { z } from 'zod';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'PRODUCTION_MANAGER', 'PACKING', 'SALES', 'ACCOUNTS', 'SHIPPING', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER', 'STORE_MANAGER']).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    // Ensure PACKING enum value exists in live DB before writing
    await ensurePackingRole();

    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined)     updateData.name         = parsed.data.name;
    if (parsed.data.role !== undefined)     updateData.role         = parsed.data.role;
    if (parsed.data.active !== undefined)   updateData.active       = parsed.data.active;
    if (parsed.data.password !== undefined) updateData.passwordHash = await hashPassword(parsed.data.password);

    const user = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, active: true, faceEnrolled: true },
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
