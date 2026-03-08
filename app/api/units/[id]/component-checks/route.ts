import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const checks = await prisma.componentCheck.findMany({
      where: { unitId: id },
      include: {
        component: true,
        checker: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(checks);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const checkSchema = z.object({
  componentId: z.string().min(1),
  stage: z.enum(['POWERSTAGE_MANUFACTURING', 'BRAINBOARD_MANUFACTURING', 'CONTROLLER_ASSEMBLY', 'QC_AND_SOFTWARE', 'REWORK', 'FINAL_ASSEMBLY']),
  checked: z.boolean(),
  scannedValue: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await req.json();
    const parsed = checkSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { componentId, stage, checked, scannedValue } = parsed.data;

    const check = await prisma.componentCheck.upsert({
      where: { unitId_componentId: { unitId: id, componentId } },
      create: {
        unitId: id,
        componentId,
        stage,
        checked,
        scannedValue: scannedValue ?? null,
        checkedById: checked ? session.id : null,
        checkedAt: checked ? new Date() : null,
      },
      update: {
        checked,
        scannedValue: scannedValue ?? null,
        checkedById: checked ? session.id : null,
        checkedAt: checked ? new Date() : null,
      },
      include: {
        component: true,
        checker: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(check);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
