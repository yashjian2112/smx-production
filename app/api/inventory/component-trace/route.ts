import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/inventory/component-trace?materialId=&jobCardId=
// Returns full trace: vendor → GRN batch → job card usage → damage reports
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'INVENTORY_MANAGER', 'STORE_MANAGER', 'PURCHASE_MANAGER', 'PRODUCTION_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const materialId = searchParams.get('materialId');
  const jobCardId = searchParams.get('jobCardId');

  if (!materialId && !jobCardId) {
    return NextResponse.json({ error: 'materialId or jobCardId required' }, { status: 400 });
  }

  if (materialId) {
    // Show all batches of this material + where each was used
    const batches = await prisma.inventoryBatch.findMany({
      where: { rawMaterialId: materialId },
      include: {
        rawMaterial: { select: { name: true, code: true, unit: true } },
        goodsReceipt: {
          include: {
            purchaseOrder: {
              include: { vendor: { select: { name: true } } },
            },
          },
        },
        jobCardItems: {
          include: {
            jobCard: {
              select: {
                cardNumber: true,
                order: { select: { orderNumber: true } },
              },
            },
          },
        },
        damageReports: {
          include: { reportedBy: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate yield rate per batch
    const tracedBatches = batches.map(b => {
      const totalIssued = b.jobCardItems.reduce((s: number, ji: { quantityIssued: number }) => s + ji.quantityIssued, 0);
      const totalReturned = b.jobCardItems.reduce((s: number, ji: { returnedQty: number }) => s + ji.returnedQty, 0);
      const totalDamaged = b.damageReports.reduce((s: number, d: { qtyDamaged: number }) => s + d.qtyDamaged, 0);
      const netUsed = totalIssued - totalReturned - totalDamaged;
      const yieldRate = totalIssued > 0 ? Math.round((netUsed / totalIssued) * 100) : null;
      return { ...b, totalIssued, totalReturned, totalDamaged, netUsed, yieldRate };
    });

    return NextResponse.json({ type: 'material', batches: tracedBatches });
  }

  // Trace by job card — show all materials, their batches, damage
  const jobCardItems = await prisma.jobCardItem.findMany({
    where: { jobCardId: jobCardId! },
    include: {
      rawMaterial: { select: { name: true, code: true, unit: true } },
      batch: {
        include: {
          goodsReceipt: {
            include: {
              purchaseOrder: {
                include: { vendor: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  const damageReports = await prisma.damageReport.findMany({
    where: { jobCardId: jobCardId! },
    include: {
      rawMaterial: { select: { name: true, unit: true } },
      batch: { select: { batchCode: true } },
      reportedBy: { select: { name: true } },
    },
  });

  return NextResponse.json({ type: 'jobCard', items: jobCardItems, damageReports });
}
