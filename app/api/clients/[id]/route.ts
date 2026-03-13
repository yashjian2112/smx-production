import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const patchSchema = z.object({
  customerName:   z.string().min(1).optional(),
  email:          z.string().email().optional().or(z.literal('')),
  phone:          z.string().optional(),
  customerType:   z.string().optional(),
  globalOrIndian: z.enum(['Global', 'Indian']).optional().or(z.literal('')),
  billingAddress: z.string().optional(),
  shippingAddress:z.string().optional(),
  gstNumber:      z.string().optional(),
  active:         z.boolean().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const client = await prisma.client.findUnique({
      where: { id: params.id },
      include: { _count: { select: { orders: true } } },
    });
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(client);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });

    const { customerName, email, phone, customerType, globalOrIndian, billingAddress, shippingAddress, gstNumber, active } = parsed.data;

    const client = await prisma.client.update({
      where: { id: params.id },
      data: {
        ...(customerName !== undefined   && { customerName }),
        ...(email        !== undefined   && { email: email || null }),
        ...(phone        !== undefined   && { phone: phone || null }),
        ...(customerType !== undefined   && { customerType: customerType || null }),
        ...(globalOrIndian !== undefined && { globalOrIndian: globalOrIndian || null }),
        ...(billingAddress !== undefined && { billingAddress: billingAddress || null }),
        ...(shippingAddress !== undefined && { shippingAddress: shippingAddress || null }),
        ...(gstNumber    !== undefined   && { gstNumber: gstNumber || null }),
        ...(active       !== undefined   && { active }),
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
