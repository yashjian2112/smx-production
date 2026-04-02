import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  generateNextPowerstageBarcode,
  generateNextBrainboardBarcode,
  generateNextQCBarcode,
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

    const { id } = await params;
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        product: { select: { code: true, productType: true } },
        units: {
          select: {
            id: true,
            serialNumber: true,
            currentStage: true,
            currentStatus: true,
            powerstageBarcode: true,
            brainboardBarcode: true,
            qcBarcode: true,
            finalAssemblyBarcode: true,
            product: { select: { code: true, productType: true } },
          },
        },
      },
    });

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    let generated = 0;
    let approved = 0;

    for (const unit of order.units) {
      const isTrading = unit.product.productType === 'TRADING';
      const unitCode = unit.product.code;
      const updates: Record<string, string | null> = {};

      if (isTrading) {
        // Trading units: only need FA barcode = serial number + approve
        if (!unit.finalAssemblyBarcode || unit.finalAssemblyBarcode !== unit.serialNumber) {
          updates.finalAssemblyBarcode = unit.serialNumber;
        }
        if (unit.currentStatus === 'PENDING') {
          updates.currentStatus = 'APPROVED';
          approved++;
        }
      } else {
        // Manufactured units: generate missing stage barcodes
        if (!unit.powerstageBarcode)
          updates.powerstageBarcode = await generateNextPowerstageBarcode(unitCode);
        if (!unit.brainboardBarcode)
          updates.brainboardBarcode = await generateNextBrainboardBarcode(unitCode);
        if (!unit.qcBarcode)
          updates.qcBarcode = await generateNextQCBarcode(unitCode);
        if (!unit.finalAssemblyBarcode || unit.finalAssemblyBarcode !== unit.serialNumber) {
          updates.finalAssemblyBarcode = unit.serialNumber;
        }
      }

      if (Object.keys(updates).length > 0) {
        await prisma.controllerUnit.update({ where: { id: unit.id }, data: updates });
        generated++;
      }
    }

    return NextResponse.json({ ok: true, generated, approved, total: order.units.length });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
