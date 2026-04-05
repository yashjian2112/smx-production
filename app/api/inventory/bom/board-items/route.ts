import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StageType } from '@prisma/client';

// GET /api/inventory/bom/board-items?jobCardId=xxx
// Returns rawMaterialIds that are marked isBoard for this job card's product+stage
export async function GET(req: NextRequest) {
  await requireSession();

  const jobCardId = new URL(req.url).searchParams.get('jobCardId');
  if (!jobCardId) return NextResponse.json([], { status: 200 });

  const jobCard = await prisma.jobCard.findUnique({
    where: { id: jobCardId },
    select: { stage: true, order: { select: { productId: true } } },
  });
  if (!jobCard) return NextResponse.json([], { status: 200 });

  const boardItems = await prisma.bOMItem.findMany({
    where: {
      productId: jobCard.order.productId,
      stage: jobCard.stage as StageType,
      isBoard: true,
    },
    select: { rawMaterialId: true },
  });

  return NextResponse.json(boardItems.map(b => b.rawMaterialId));
}
