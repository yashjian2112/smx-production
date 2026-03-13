import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createSchema = z.object({
  code:           z.string().min(1),
  customerName:   z.string().min(1),
  email:          z.string().email().optional().or(z.literal('')),
  phone:          z.string().optional(),
  customerType:   z.string().optional(),
  globalOrIndian: z.enum(['Global', 'Indian']).optional(),
  state:          z.string().optional(),
  billingAddress: z.string().optional(),
  shippingAddress:z.string().optional(),
  gstNumber:      z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const active = searchParams.get('active');

    const clients = await prisma.client.findMany({
      where: active === 'true' ? { active: true } : {},
      orderBy: { customerName: 'asc' },
    });
    return NextResponse.json(clients);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { code, customerName, email, phone, customerType, globalOrIndian, state, billingAddress, shippingAddress, gstNumber } = parsed.data;

    const existing = await prisma.client.findUnique({ where: { code } });
    if (existing) return NextResponse.json({ error: `Client code "${code}" already exists` }, { status: 400 });

    const client = await prisma.client.create({
      data: {
        code,
        customerName,
        email:          email || null,
        phone:          phone || null,
        customerType:   customerType || null,
        globalOrIndian: globalOrIndian || null,
        state:          state || null,
        billingAddress: billingAddress || null,
        shippingAddress:shippingAddress || null,
        gstNumber:      gstNumber || null,
      },
    });
    return NextResponse.json(client);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
