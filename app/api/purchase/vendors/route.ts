import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const createSchema = z.object({
  name:           z.string().min(1),
  contactPerson:  z.string().optional(),
  phone:          z.string().optional(),
  email:          z.string().email().optional().or(z.literal('')),
  address:        z.string().optional(),
  gstNumber:      z.string().optional(),
  categories:     z.array(z.string()).optional(),
  // Optional portal credentials set at creation time
  portalEmail:    z.string().email().optional().or(z.literal('')),
  portalPassword: z.string().min(6).optional(),
});

export async function GET() {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER', 'ACCOUNTS'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const vendors = await prisma.vendor.findMany({
    where: { active: true },
    orderBy: { code: 'asc' },
    include: {
      _count: { select: { purchaseOrders: true, bids: true } },
    },
  });

  return NextResponse.json(vendors);
}

export async function POST(req: Request) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const data = createSchema.parse(body);

  // Auto-generate vendor code
  const last = await prisma.vendor.findFirst({ orderBy: { code: 'desc' }, select: { code: true } });
  let next = 1;
  if (last) {
    const n = parseInt(last.code.replace('V', ''), 10);
    if (!isNaN(n)) next = n + 1;
  }
  const code = `V${String(next).padStart(3, '0')}`;

  // Hash portal password if provided
  let portalPassword: string | undefined;
  if (data.portalEmail && data.portalPassword) {
    portalPassword = await bcrypt.hash(data.portalPassword, 10);
  }

  const vendor = await prisma.vendor.create({
    data: {
      code,
      name:           data.name,
      contactPerson:  data.contactPerson,
      phone:          data.phone,
      email:          data.email || null,
      address:        data.address,
      gstNumber:      data.gstNumber,
      categories:     data.categories ?? [],
      portalEmail:    data.portalEmail || null,
      portalPassword: portalPassword ?? null,
      isPortalActive: !!(data.portalEmail && portalPassword),
    },
  });

  return NextResponse.json(vendor, { status: 201 });
}
