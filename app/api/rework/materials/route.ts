import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET /api/rework/materials?reworkRecordId=xxx — list materials for a rework record */
export async function GET(req: NextRequest) {
  try {
    await requireSession();
    const reworkRecordId = req.nextUrl.searchParams.get('reworkRecordId');
    if (!reworkRecordId) return NextResponse.json({ error: 'reworkRecordId required' }, { status: 400 });

    const materials = await prisma.reworkMaterial.findMany({
      where: { reworkRecordId },
      include: { rawMaterial: { select: { id: true, name: true, code: true, unit: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(materials);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[rework-materials GET]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** POST /api/rework/materials — log a material consumed during rework */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const { reworkRecordId, rawMaterialId, quantity, notes } = await req.json();

    if (!reworkRecordId || !rawMaterialId || !quantity) {
      return NextResponse.json({ error: 'reworkRecordId, rawMaterialId, and quantity required' }, { status: 400 });
    }

    // Validate rework record exists
    const rework = await prisma.reworkRecord.findUnique({ where: { id: reworkRecordId } });
    if (!rework) return NextResponse.json({ error: 'Rework record not found' }, { status: 404 });

    // Get raw material details
    const material = await prisma.rawMaterial.findUnique({
      where: { id: rawMaterialId },
      select: { id: true, name: true, unit: true, currentStock: true },
    });
    if (!material) return NextResponse.json({ error: 'Material not found' }, { status: 404 });

    const qty = parseFloat(quantity);
    if (qty <= 0) return NextResponse.json({ error: 'Quantity must be positive' }, { status: 400 });

    // Create rework material record + deduct stock + create stock movement in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create rework material (auto-issued since technician is consuming it)
      const rm = await tx.reworkMaterial.create({
        data: {
          reworkRecordId,
          rawMaterialId,
          materialName: material.name,
          unit: material.unit,
          qtyRequested: qty,
          qtyIssued: qty,
          status: 'ISSUED',
          notes: notes?.trim() || null,
          requestedById: session.id,
          issuedById: session.id,
          issuedAt: new Date(),
        },
        include: { rawMaterial: { select: { id: true, name: true, code: true, unit: true } } },
      });

      // Deduct from stock
      await tx.rawMaterial.update({
        where: { id: rawMaterialId },
        data: { currentStock: { decrement: qty } },
      });

      // Create stock movement record
      await tx.stockMovement.create({
        data: {
          rawMaterialId,
          type: 'OUT',
          quantity: -qty,
          adjustmentType: 'PRODUCTION',
          reference: `Rework #${rework.id.slice(-6)}`,
          notes: `Rework material — ${material.name}`,
          createdById: session.id,
        },
      });

      return rm;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[rework-materials POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
