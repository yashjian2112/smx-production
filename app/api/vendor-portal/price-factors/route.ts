import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/vendor-portal/price-factors?token=xxx
// Vendor fetches required breakdown factors before submitting quote
// Filtered by RFQ's vendor categories
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 });

  const invite = await prisma.rFQVendorInvite.findFirst({
    where: { token },
    include: { vendor: { select: { categories: true } } },
  });
  if (!invite) return NextResponse.json({ error: 'Invalid token' }, { status: 404 });

  const vendorCategories = invite.vendor.categories;

  const factors = await prisma.priceBreakdownFactor.findMany({
    where: {
      active: true,
      OR: [
        { category: null },
        ...(vendorCategories.length > 0 ? [{ category: { in: vendorCategories } }] : []),
      ],
    },
    orderBy: [{ order: 'asc' }],
    select: { id: true, name: true, description: true, category: true, isRequired: true },
  });

  return NextResponse.json(factors);
}
