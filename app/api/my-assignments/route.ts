import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await requireSession();

  const assignments = await prisma.stageAssignment.findMany({
    where: { userId: session.id },
    include: {
      unit: {
        include: {
          order: {
            include: { product: { select: { id: true, name: true, code: true } } },
          },
        },
      },
    },
    orderBy: { assignedAt: 'desc' },
  });

  return NextResponse.json(assignments);
}
