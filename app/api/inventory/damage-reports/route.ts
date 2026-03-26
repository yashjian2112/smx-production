import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/inventory/damage-reports?materialId=&jobCardId=
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'STORE_MANAGER', 'PURCHASE_MANAGER', 'PRODUCTION_EMPLOYEE'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const materialId = searchParams.get('materialId');
  const jobCardId = searchParams.get('jobCardId');

  const reports = await prisma.damageReport.findMany({
    where: {
      ...(materialId && { rawMaterialId: materialId }),
      ...(jobCardId && { jobCardId }),
    },
    include: {
      rawMaterial: { select: { id: true, name: true, code: true, unit: true } },
      batch: { select: { id: true, batchCode: true, unitPrice: true, goodsReceiptId: true } },
      jobCard: { select: { id: true, cardNumber: true, stage: true } },
      reportedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json(reports);
}

// POST /api/inventory/damage-reports
// Called by production employee from job card screen
// Deducts from currentStock and logs a DAMAGE stock movement
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'STORE_MANAGER', 'PRODUCTION_EMPLOYEE'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as {
    jobCardId?: string;
    rawMaterialId: string;
    batchId?: string;
    stage?: string;
    qtyDamaged: number;
    reason: string;
    notes?: string;
  };

  if (!body.rawMaterialId) return NextResponse.json({ error: 'rawMaterialId required' }, { status: 400 });
  if (!body.qtyDamaged || body.qtyDamaged <= 0) return NextResponse.json({ error: 'qtyDamaged must be > 0' }, { status: 400 });
  if (!body.reason?.trim()) return NextResponse.json({ error: 'reason required' }, { status: 400 });

  const report = await prisma.$transaction(async (tx) => {
    // Create damage report
    const dr = await tx.damageReport.create({
      data: {
        jobCardId: body.jobCardId ?? null,
        rawMaterialId: body.rawMaterialId,
        batchId: body.batchId ?? null,
        stage: body.stage ?? null,
        qtyDamaged: body.qtyDamaged,
        reason: body.reason.trim(),
        notes: body.notes?.trim() ?? null,
        reportedById: session.id,
      },
      include: {
        rawMaterial: { select: { id: true, name: true, code: true, unit: true } },
        batch: { select: { batchCode: true } },
        reportedBy: { select: { name: true } },
      },
    });

    // Deduct from currentStock
    const material = await tx.rawMaterial.findUnique({
      where: { id: body.rawMaterialId },
      select: { currentStock: true, name: true },
    });
    if (!material) throw new Error('Material not found');
    if (material.currentStock < body.qtyDamaged) {
      throw new Error(`Cannot report ${body.qtyDamaged} damaged — only ${material.currentStock} in stock`);
    }

    await tx.rawMaterial.update({
      where: { id: body.rawMaterialId },
      data: { currentStock: { decrement: body.qtyDamaged } },
    });

    // Log stock movement
    await tx.stockMovement.create({
      data: {
        rawMaterialId: body.rawMaterialId,
        type: 'ADJUSTMENT',
        quantity: -body.qtyDamaged,
        adjustmentType: 'DAMAGE',
        reference: body.jobCardId ?? 'DAMAGE_REPORT',
        notes: `Damage reported: ${body.reason.trim()}${body.notes ? ` — ${body.notes.trim()}` : ''}`,
        createdById: session.id,
      },
    });

    return dr;
  });

  return NextResponse.json(report, { status: 201 });
}
