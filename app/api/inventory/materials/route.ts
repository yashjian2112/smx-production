import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateNextMaterialCode } from '@/lib/invoice-number';
import { generateMaterialBarcode } from '@/lib/inventory-utils';

// STORE_MANAGER and INVENTORY_MANAGER can view materials
const VIEW_ROLES    = ['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'] as const;
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
  barcodePrefix:     z.string().min(2).max(8),
  packSize:          z.number().int().min(1).default(1),
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
      variants:        { where: { active: true }, select: { id: true, name: true, barcode: true, currentStock: true } },
      _count:          { select: { batches: true, stockMovements: true, purchaseRequests: true } },
    },
  });

  // Compute committed stock per material from pending/issued job card items
  const committedItems = await prisma.jobCardItem.findMany({
    where: { jobCard: { status: { in: ['PENDING', 'DISPATCHED'] } } },
    select: { rawMaterialId: true, quantityReq: true, quantityIssued: true },
  });
  const committedMap: Record<string, number> = {};
  for (const item of committedItems) {
    const pending = Math.max(0, item.quantityReq - item.quantityIssued);
    committedMap[item.rawMaterialId] = (committedMap[item.rawMaterialId] ?? 0) + pending;
  }

  // Attach low-stock flag + committed
  const result = materials.map(m => ({
    ...m,
    committedStock: committedMap[m.id] ?? 0,
    availableStock: m.currentStock - (committedMap[m.id] ?? 0),
    isLowStock:     m.currentStock <= m.reorderPoint,
    isCritical:     m.currentStock <= m.minimumStock,
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!ALLOWED_ROLES.includes(session.role as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  // Check for duplicate material name
  const existingName = await prisma.rawMaterial.findFirst({
    where: { name: { equals: data.name.trim(), mode: 'insensitive' } },
  });
  if (existingName) {
    return NextResponse.json({ error: `Material "${existingName.name}" already exists (code: ${existingName.code})` }, { status: 409 });
  }

  const code    = data.code || await generateNextMaterialCode();
  const barcode = await generateMaterialBarcode(data.categoryId, data.barcodePrefix);

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
      packSize:          data.packSize,
    },
    include: {
      category:        { select: { id: true, name: true } },
      preferredVendor: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(material, { status: 201 });
}
