import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// POST /api/procurement/vendors/[id]/portal-access — admin sets vendor portal credentials
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { portalEmail, password, categories, isPortalActive } = await req.json();

  if (!portalEmail) return NextResponse.json({ error: 'Portal email required' }, { status: 400 });

  const updateData: Record<string, unknown> = {
    portalEmail: portalEmail.toLowerCase().trim(),
    isPortalActive: isPortalActive ?? true,
  };

  if (categories) updateData.categories = categories;
  if (password) {
    updateData.portalPassword = await bcrypt.hash(password, 10);
  }

  const vendor = await prisma.vendor.update({
    where: { id: (await params).id },
    data: updateData,
    select: { id: true, name: true, portalEmail: true, isPortalActive: true, categories: true },
  });

  return NextResponse.json(vendor);
}
