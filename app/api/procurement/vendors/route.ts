import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const vendors = await prisma.vendor.findMany({
    include: {
      performance: { orderBy: { recordedAt: 'desc' }, take: 10 },
    },
    orderBy: { code: 'asc' },
  });
  return NextResponse.json(vendors);
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const { name, contactPerson, phone, email, address, gstNumber, categories } = body as {
    name: string; contactPerson?: string; phone?: string; email?: string;
    address?: string; gstNumber?: string; categories?: string[];
  };
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  // Auto-generate vendor code V001, V002...
  const last = await prisma.vendor.findFirst({ orderBy: { code: 'desc' } });
  const nextNum = last ? parseInt(last.code.replace('V', '')) + 1 : 1;
  const code = `V${String(nextNum).padStart(3, '0')}`;

  const vendor = await prisma.vendor.create({
    data: {
      code, name: name.trim(),
      contactPerson: contactPerson?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      address: address?.trim() || null,
      gstNumber: gstNumber?.trim() || null,
      categories: categories ?? [],
    },
  });
  return NextResponse.json(vendor, { status: 201 });
}
