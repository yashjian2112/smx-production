import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateSchema = z.object({
  boxSizeId: z.string().min(1),
  weightKg:  z.number().positive(),
});

// PATCH /api/dispatch-orders/[id]/boxes/[boxId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; boxId: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING');

    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });

    const box = await prisma.packingBox.findUnique({
      where:  { id: params.boxId },
      select: { id: true, dispatchOrderId: true },
    });
    if (!box) return NextResponse.json({ error: 'Box not found' }, { status: 404 });
    if (box.dispatchOrderId !== params.id)
      return NextResponse.json({ error: 'Box does not belong to this dispatch order' }, { status: 400 });

    const updated = await prisma.packingBox.update({
      where: { id: params.boxId },
      data:  { boxSizeId: parsed.data.boxSizeId, weightKg: parsed.data.weightKg },
      include: { boxSize: true, items: { include: { unit: { select: { serialNumber: true, finalAssemblyBarcode: true } } } } },
    });

    return NextResponse.json({ box: updated });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
