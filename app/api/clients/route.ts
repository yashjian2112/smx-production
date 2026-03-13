import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const createSchema = z.object({
  customerName:   z.string().min(1),
  email:          z.string().email(),
  phone:          z.string().min(1),
  customerType:   z.string().optional(),
  globalOrIndian: z.enum(['Global', 'Indian']).optional(),
  state:          z.string().optional(),
  billingAddress: z.string().min(1),
  shippingAddress:z.string().min(1),
  gstNumber:      z.string().optional(),
});

async function generateClientCode(): Promise<string> {
  const clients = await prisma.client.findMany({ select: { code: true } });
  let max = 0;
  for (const c of clients) {
    const match = c.code.match(/^CLI(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return `CLI${String(max + 1).padStart(3, '0')}`;
}

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
    requireRole(session, 'ADMIN', 'SALES');

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { customerName, email, phone, customerType, globalOrIndian, state, billingAddress, shippingAddress, gstNumber } = parsed.data;

    const code = await generateClientCode();

    const client = await prisma.client.create({
      data: {
        code,
        customerName,
        email,
        phone,
        customerType:   customerType || null,
        globalOrIndian: globalOrIndian || null,
        state:          state || null,
        billingAddress,
        shippingAddress,
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
