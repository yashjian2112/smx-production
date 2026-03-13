import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  generateNextPowerstageBarcode,
  generateNextBrainboardBarcode,
  generateNextQCBarcode,
  generateNextFinalAssemblyBarcode,
} from '@/lib/barcode';

/** POST /api/orders/[id]/generate-barcodes
 *  Admin/Manager only: generates missing stage barcodes for all units in the order.
 *  Skips units that already have all barcodes set.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    if (session.role === 'PRODUCTION_EMPLOYEE') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        product: { select: { code: true } },
        units: {
          select: {
            id: true,
            currentStage: true,
            powerstageBarcode: true,
            brainboardBarcode: true,
            qcBarcode: true,
            finalAssemblyBarcode: true,
          },
        },
      },
    });

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const modelCode = order.product.code;
    let generated = 0;

    for (const unit of order.units) {
      const updates: Record<string, string> = {};

      if (!unit.powerstageBarcode)
        updates.powerstageBarcode = await generateNextPowerstageBarcode(modelCode);
      if (!unit.brainboardBarcode)
        updates.brainboardBarcode = await generateNextBrainboardBarcode(modelCode);
      if (!unit.qcBarcode)
        updates.qcBarcode = await generateNextQCBarcode(modelCode);
      if (unit.currentStage === 'FINAL_ASSEMBLY' && !unit.finalAssemblyBarcode)
        updates.finalAssemblyBarcode = await generateNextFinalAssemblyBarcode(modelCode);

      if (Object.keys(updates).length > 0) {
        await prisma.controllerUnit.update({ where: { id: unit.id }, data: updates });
        generated++;
      }
    }

    return NextResponse.json({ ok: true, generated, total: order.units.length });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
