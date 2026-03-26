import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/procurement/samples — all quotes with sampleStatus != NONE
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await prisma.vendorQuote.findMany({
    where: { sampleStatus: { not: 'NONE' } },
    include: {
      vendor: { select: { id: true, name: true, code: true } },
      rfq: {
        select: {
          id: true, rfqNumber: true, title: true,
          items: {
            include: { material: { select: { name: true, unit: true } } }
          }
        }
      },
    },
    orderBy: { sampleRequestedAt: 'desc' },
  });

  return NextResponse.json(rows);
}
