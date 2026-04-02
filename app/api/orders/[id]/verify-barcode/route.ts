import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/orders/[id]/verify-barcode
 * Scan a barcode to verify it belongs to a trading unit in this order.
 * Sets barcodeVerified = true on the unit.
 * Body: { barcode: string }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const { barcode } = await req.json() as { barcode: string };

  if (!barcode?.trim()) {
    return NextResponse.json({ error: 'Barcode is required' }, { status: 400 });
  }

  const code = barcode.trim().toUpperCase();

  // Find unit by serial number (FA barcode = serial) in this order
  const unit = await prisma.controllerUnit.findFirst({
    where: {
      orderId: id,
      OR: [
        { serialNumber: code },
        { finalAssemblyBarcode: code },
      ],
    },
    include: { product: { select: { name: true, productType: true } } },
  });

  if (!unit) {
    return NextResponse.json({ error: 'Barcode not found in this order' }, { status: 404 });
  }

  if (unit.product.productType !== 'TRADING') {
    return NextResponse.json({ error: 'This unit is a manufactured product — not a trading item' }, { status: 400 });
  }

  if (unit.barcodeVerified) {
    return NextResponse.json({ ...unit, alreadyVerified: true });
  }

  // Mark this unit as verified AND completed in one update
  const updated = await prisma.controllerUnit.update({
    where: { id: unit.id },
    data: { barcodeVerified: true, currentStatus: 'COMPLETED' },
    include: { product: { select: { name: true, productType: true } } },
  });

  // Check if ALL trading units in this order are now verified
  const remaining = await prisma.controllerUnit.count({
    where: { orderId: id, product: { productType: 'TRADING' }, barcodeVerified: false },
  });

  return NextResponse.json({ ...updated, allVerified: remaining === 0 });
}

/**
 * GET /api/orders/[id]/verify-barcode
 * Get verification status of all trading units in this order.
 * Auto-fixes stale data: if all verified but units not COMPLETED, marks them COMPLETED.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;

  const units = await prisma.controllerUnit.findMany({
    where: { orderId: id, product: { productType: 'TRADING' } },
    select: { id: true, serialNumber: true, barcodeVerified: true, currentStatus: true, product: { select: { name: true } } },
    orderBy: { serialNumber: 'asc' },
  });

  // Auto-fix: if all verified but units still not COMPLETED, complete them now
  const allVerified = units.length > 0 && units.every(u => u.barcodeVerified);
  const anyStuck = units.some(u => u.barcodeVerified && u.currentStatus !== 'COMPLETED' && u.currentStatus !== 'APPROVED');
  if (allVerified && anyStuck) {
    await prisma.controllerUnit.updateMany({
      where: { orderId: id, product: { productType: 'TRADING' }, currentStatus: { notIn: ['COMPLETED', 'BLOCKED'] } },
      data: { currentStatus: 'COMPLETED' },
    });
    // Return updated data
    const updated = await prisma.controllerUnit.findMany({
      where: { orderId: id, product: { productType: 'TRADING' } },
      select: { id: true, serialNumber: true, barcodeVerified: true, currentStatus: true, product: { select: { name: true } } },
      orderBy: { serialNumber: 'asc' },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json(units);
}
