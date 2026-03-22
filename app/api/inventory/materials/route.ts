import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextMaterialCode } from '@/lib/invoice-number';
import { generateMaterialBarcode } from '@/lib/inventory-utils';

// STORE_MANAGER and INVENTORY_MANAGER can view materials
const VIEW_ROLES    = ['ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER', 'INVENTORY_MANAGER'] as const;
const ALLOWED_ROLES = ['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'] as const;

const createSchema = z.object({
  name:              z.string().min(1),
  unit:              z.string().min(1),
  purchaseUnit:      z.string().optional(),
  conversionFactor:  z.number().positive().optional(),
  description:       z.string().optional(),
  hsnCode:           z.string().optional(),
  purchasePrice:     z.number().min(0).default(0),
  leadTimeDays:      z.number().int().min(0).default(0),
  categoryId:        z.string().optional(),
  preferredVendorId: z.string().optional(),
  minimumStock:      z.number().min(0).default(0),
  reorderPoint:      z.number().min(0).default(0),
  code:              z.string().optional(),
});

export async function GET() {
  const session = await requireSession();
  if (!VIEW_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const materials = await prisma.rawMaterial.findMany({
    where:   { active: true },
    orderBy: { name: 'asc' },
    include: {
      category:        { select: { id: true, name: true } },
      preferredVendor: { select: { id: true, name: true } },
      _count:          { select: { batches: true, stockMovements: true, purchaseRequests: true } },
    },
  });

  // Attach low-stock flag
  const result = materials.map(m => ({
    ...m,
    isLowStock:    m.currentStock <= m.reorderPoint,
    isCritical:    m.currentStock <= m.minimumStock,
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = createSchema.parse(body);

  const code    = data.code || await generateNextMaterialCode();
  const barcode = await generateMaterialBarcode(data.categoryId);

  const material = await prisma.rawMaterial.create({
    data: {
      code,
      barcode,
      name:              data.name,
      unit:              data.unit,
      purchaseUnit:      data.purchaseUnit ?? null,
      conversionFactor:  data.conversionFactor ?? null,
      description:       data.description ?? null,
      categoryId:        data.categoryId ?? null,
      preferredVendorId: data.preferredVendorId ?? null,
      minimumStock:      data.minimumStock,
      reorderPoint:      data.reorderPoint,
    },
    include: {
      category:        { select: { id: true, name: true } },
      preferredVendor: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(material, { status: 201 });
}
