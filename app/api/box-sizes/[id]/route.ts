import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateSchema = z.object({
  name:      z.string().min(1).optional(),
  lengthCm:  z.number().positive().optional(),
  widthCm:   z.number().positive().optional(),
  heightCm:  z.number().positive().optional(),
  active:    z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const existing = await prisma.boxSize.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Box size not found' }, { status: 404 });

    const boxSize = await prisma.boxSize.update({
      where: { id: params.id },
      data:  parsed.data,
    });
    return NextResponse.json({ boxSize });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const existing = await prisma.boxSize.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Box size not found' }, { status: 404 });

    // Soft-delete
    const boxSize = await prisma.boxSize.update({
      where: { id: params.id },
      data:  { active: false },
    });
    return NextResponse.json({ boxSize });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
