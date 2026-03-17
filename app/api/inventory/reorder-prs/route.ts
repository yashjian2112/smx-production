import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getFiscalYear } from '@/lib/invoice-number';

const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER'] as const;

async function generatePRNumber(): Promise<string> {
  const fy     = getFiscalYear();
  const prefix = `PR/${fy}/`;
  const latest = await prisma.purchaseRequest.findFirst({
    where:   { requestNumber: { startsWith: prefix } },
    orderBy: { requestNumber: 'desc' },
    select:  { requestNumber: true },
  });
  let next = 1;
  if (latest) {
    const parts = latest.requestNumber.split('/');
    const seq   = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(seq)) next = seq + 1;
  }
  return `${prefix}${String(next).padStart(3, '0')}`;
}

export async function POST() {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get all active materials below reorder point
  const materials = await prisma.rawMaterial.findMany({
    where:   { active: true },
    include: {
      purchaseRequests: {
        where:  { status: { notIn: ['RECEIVED', 'CANCELLED'] } },
        select: { id: true },
        take:   1,
      },
    },
  });

  const lowStock = materials.filter(m => m.currentStock <= m.reorderPoint && m.reorderPoint > 0);
  const withoutOpenPR = lowStock.filter(m => m.purchaseRequests.length === 0);

  if (withoutOpenPR.length === 0) {
    return NextResponse.json({ created: 0, materials: [], message: 'All low-stock items already have open PRs' });
  }

  const created: { requestNumber: string; materialName: string }[] = [];

  for (const m of withoutOpenPR) {
    const requestNumber = await generatePRNumber();
    const suggestedQty  = Math.max(1, m.reorderPoint - m.currentStock);

    const pr = await prisma.purchaseRequest.create({
      data: {
        requestNumber,
        rawMaterialId:    m.id,
        quantityRequired: suggestedQty,
        unit:             m.unit,
        urgency:          m.currentStock === 0 ? 'CRITICAL' : m.currentStock <= m.minimumStock ? 'HIGH' : 'MEDIUM',
        notes:            `Auto-created: stock (${m.currentStock} ${m.unit}) at or below reorder point (${m.reorderPoint} ${m.unit})`,
        requestedById:    session.id,
        status:           'DRAFT',
      },
    });

    created.push({ requestNumber: pr.requestNumber, materialName: m.name });
  }

  return NextResponse.json({ created: created.length, materials: created });
}
