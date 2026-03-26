import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const detailsSchema = z.object({
  weightKg:  z.number().positive().optional(),
  boxSizeId: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; boxId: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'SHIPPING', 'PACKING');

    const body = await req.json();
    const parsed = detailsSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    // Verify box belongs to dispatch order
    const existing = await prisma.packingBox.findUnique({
      where:  { id: params.boxId },
      select: { id: true, dispatchOrderId: true, isSealed: true },
    });
    if (!existing) return NextResponse.json({ error: 'Box not found' }, { status: 404 });
    if (existing.dispatchOrderId !== params.id)
      return NextResponse.json({ error: 'Box does not belong to this dispatch order' }, { status: 400 });

    const box = await prisma.packingBox.update({
      where: { id: params.boxId },
      data:  parsed.data,
      include: {
        items: {
          orderBy: { scannedAt: 'asc' },
          include: {
            unit: { select: { serialNumber: true, finalAssemblyBarcode: true } },
          },
        },
        boxSize: true,
      },
    });

    return NextResponse.json({ box });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
