import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Map fault stage keys (from UI) to StageType enum values
const STAGE_MAP: Record<string, string> = {
  POWERSTAGE: 'POWERSTAGE_MANUFACTURING',
  BRAINBOARD:  'BRAINBOARD_MANUFACTURING',
  ASSEMBLY:    'CONTROLLER_ASSEMBLY',
  QC:          'QC_AND_SOFTWARE',
  FINAL:       'FINAL_ASSEMBLY',
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();
    if (!['ADMIN', 'PRODUCTION_MANAGER', 'PRODUCTION_EMPLOYEE', 'STORE_MANAGER'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const faultStage = searchParams.get('stage') ?? '';

    // Load the return request with its linked unit
    const ret = await prisma.returnRequest.findUnique({
      where: { id: params.id },
      select: {
        unit: {
          select: {
            product: { select: { id: true } },
          },
        },
      },
    });

    if (!ret) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // If no unit (manually entered serial), return empty — no BOM constraint
    if (!ret.unit?.product?.id) return NextResponse.json([]);

    const productId = ret.unit.product.id;

    // Map UI stage key to StageType
    const stageEnum = STAGE_MAP[faultStage] ?? null;

    // Fetch BOM items for this product at this stage (or all stages if no stage given)
    const bomItems = await prisma.bOMItem.findMany({
      where: {
        productId,
        ...(stageEnum ? { stage: stageEnum as any } : {}),
      },
      include: {
        rawMaterial: {
          select: {
            id: true,
            code: true,
            name: true,
            unit: true,
            currentStock: true,
            minimumStock: true,
          },
        },
      },
      orderBy: { rawMaterial: { name: 'asc' } },
    });

    return NextResponse.json(
      bomItems.map(b => ({
        rawMaterialId:    b.rawMaterialId,
        materialName:     b.rawMaterial.name,
        code:             b.rawMaterial.code,
        unit:             b.unit,
        quantityRequired: b.quantityRequired,
        currentStock:     b.rawMaterial.currentStock,
        minimumStock:     b.rawMaterial.minimumStock,
      }))
    );
  } catch (e) {
    if (e instanceof Error && (e.message === 'Unauthorized' || e.message === 'Forbidden'))
      return NextResponse.json({ error: e.message }, { status: e.message === 'Unauthorized' ? 401 : 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
