import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateComponentBarcode } from '@/lib/barcode';

const STAGE_SUFFIX: Record<string, 'PS' | 'BB' | 'AS' | 'FA'> = {
  POWERSTAGE_MANUFACTURING: 'PS',
  BRAINBOARD_MANUFACTURING: 'BB',
  CONTROLLER_ASSEMBLY: 'AS',
  FINAL_ASSEMBLY: 'FA',
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id: productId } = await params;

    const product = await prisma.product.findUnique({ where: { id: productId }, select: { code: true } });
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    const { name, partNumber, stage, qty } = await req.json();
    if (!name || !stage || !qty || qty < 1 || qty > 1000) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 });
    }
    const suffix = STAGE_SUFFIX[stage];
    if (!suffix) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });

    const barcodes: string[] = [];
    for (let i = 0; i < qty; i++) {
      const barcode = await generateComponentBarcode(product.code, suffix);
      await prisma.productComponent.create({
        data: { productId, name, partNumber: partNumber || null, stage, barcode, required: true, printed: false },
      });
      barcodes.push(barcode);
    }

    return NextResponse.json({ barcodes });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH: confirm barcodes were actually printed
export async function PATCH(req: NextRequest, { params: _params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { barcodes } = await req.json();
    if (!Array.isArray(barcodes) || barcodes.length === 0)
      return NextResponse.json({ error: 'No barcodes' }, { status: 400 });

    await prisma.productComponent.updateMany({
      where: { barcode: { in: barcodes } },
      data: { printed: true, printedAt: new Date() },
    });
    return NextResponse.json({ confirmed: barcodes.length });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
