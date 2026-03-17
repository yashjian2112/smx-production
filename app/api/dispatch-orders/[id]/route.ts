import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const patchSchema = z.object({
  totalBoxes: z.number().int().min(1).max(50),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'ACCOUNTS', 'SHIPPING', 'PACKING');

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      include: {
        order: {
          select: {
            orderNumber: true,
            quantity: true,
            client: { select: { customerName: true, globalOrIndian: true } },
            product: { select: { code: true, name: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        boxes: {
          orderBy: { boxNumber: 'asc' },
          include: {
            items: {
              orderBy: { scannedAt: 'asc' },
              include: {
                unit: { select: { serialNumber: true, finalAssemblyBarcode: true } },
              },
            },
          },
        },
        invoices: {
          include: {
            items: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (!dispatchOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(dispatchOrder);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH: Start packing — declare total box count and create PackingBox records
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'PACKING');

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { totalBoxes } = parsed.data;

    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, doNumber: true },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (dispatchOrder.status !== 'OPEN')
      return NextResponse.json({ error: 'Dispatch order must be OPEN to start packing' }, { status: 400 });

    const doNumber = dispatchOrder.doNumber;

    const updated = await prisma.$transaction(async (tx) => {
      // Update DO
      const updatedDO = await tx.dispatchOrder.update({
        where: { id: params.id },
        data: { totalBoxes, status: 'PACKING' },
      });

      // Create N PackingBox records
      for (let i = 1; i <= totalBoxes; i++) {
        await tx.packingBox.create({
          data: {
            dispatchOrderId: params.id,
            boxNumber: i,
            boxLabel: `${doNumber}-BOX-${i}of${totalBoxes}`,
            isSealed: false,
          },
        });
      }

      return updatedDO;
    });

    // Return the full DO with boxes
    const result = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      include: {
        order: {
          select: {
            orderNumber: true,
            quantity: true,
            client: { select: { customerName: true, globalOrIndian: true } },
            product: { select: { code: true, name: true } },
          },
        },
        createdBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
        boxes: {
          orderBy: { boxNumber: 'asc' },
          include: {
            items: {
              orderBy: { scannedAt: 'asc' },
              include: {
                unit: { select: { serialNumber: true, finalAssemblyBarcode: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
