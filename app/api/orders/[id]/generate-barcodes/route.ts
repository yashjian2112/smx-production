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

    const FA_STAGE_IDX = ['POWERSTAGE_MANUFACTURING','BRAINBOARD_MANUFACTURING','CONTROLLER_ASSEMBLY','QC_AND_SOFTWARE','FINAL_ASSEMBLY'].indexOf('FINAL_ASSEMBLY');

    for (const unit of order.units) {
      const updates: Record<string, string | null> = {};
      const unitStageIdx = ['POWERSTAGE_MANUFACTURING','BRAINBOARD_MANUFACTURING','CONTROLLER_ASSEMBLY','QC_AND_SOFTWARE','FINAL_ASSEMBLY'].indexOf(unit.currentStage);

      if (!unit.powerstageBarcode)
        updates.powerstageBarcode = await generateNextPowerstageBarcode(modelCode);
      if (!unit.brainboardBarcode)
        updates.brainboardBarcode = await generateNextBrainboardBarcode(modelCode);
      if (!unit.qcBarcode)
        updates.qcBarcode = await generateNextQCBarcode(modelCode);

      if (unitStageIdx >= FA_STAGE_IDX) {
        // Unit is at or past FA — generate FA barcode if missing
        if (!unit.finalAssemblyBarcode)
          updates.finalAssemblyBarcode = await generateNextFinalAssemblyBarcode(modelCode);
      } else {
        // Unit hasn't reached FA yet — clear any wrongly pre-assigned FA barcode
        // so it will receive a fresh barcode in the correct format when it enters FA
        if (unit.finalAssemblyBarcode)
          updates.finalAssemblyBarcode = null;
      }

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
