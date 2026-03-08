import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateComponentBarcode } from '@/lib/barcode';
import { z } from 'zod';

// Only the 4 production stages that get component barcodes
const COMPONENT_STAGES = ['POWERSTAGE_MANUFACTURING', 'BRAINBOARD_MANUFACTURING', 'CONTROLLER_ASSEMBLY', 'FINAL_ASSEMBLY'] as const;
type ComponentStage = typeof COMPONENT_STAGES[number];

const STAGE_SUFFIX: Record<ComponentStage, 'PS' | 'BB' | 'AS' | 'FA'> = {
  POWERSTAGE_MANUFACTURING: 'PS',
  BRAINBOARD_MANUFACTURING: 'BB',
  CONTROLLER_ASSEMBLY: 'AS',
  FINAL_ASSEMBLY: 'FA',
};

const createSchema = z.object({
  name: z.string().min(1).max(200),
  partNumber: z.string().max(100).optional(),
  description: z.string().optional(),
  stage: z.enum(COMPONENT_STAGES),  // required — 4 stages only
  sortOrder: z.number().int().optional(),
  required: z.boolean().optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const components = await prisma.productComponent.findMany({
      where: { productId: id, active: true },
      orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return NextResponse.json(components);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER');
    const { id } = await params;

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { name, partNumber, description, stage, sortOrder, required } = parsed.data;

    // Auto-generate barcode: productCode + stageSuffix + 4-digit seq
    const barcode = await generateComponentBarcode(product.code, STAGE_SUFFIX[stage]);

    const component = await prisma.productComponent.create({
      data: {
        productId: id,
        name,
        partNumber: partNumber ?? null,
        barcode,
        description: description ?? null,
        stage,
        sortOrder: sortOrder ?? 0,
        required: required ?? true,
      },
    });
    return NextResponse.json(component);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
