import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireSession();
  if (!['ADMIN', 'PURCHASE_MANAGER'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json();
  const { name, contactPerson, phone, email, address, gstNumber, categories, active } = body as {
    name?: string; contactPerson?: string; phone?: string; email?: string;
    address?: string; gstNumber?: string; categories?: string[]; active?: boolean;
  };
  const vendor = await prisma.vendor.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(contactPerson !== undefined && { contactPerson: contactPerson.trim() || null }),
      ...(phone !== undefined && { phone: phone.trim() || null }),
      ...(email !== undefined && { email: email.trim() || null }),
      ...(address !== undefined && { address: address.trim() || null }),
      ...(gstNumber !== undefined && { gstNumber: gstNumber.trim() || null }),
      ...(categories !== undefined && { categories }),
      ...(active !== undefined && { active }),
    },
  });
  return NextResponse.json(vendor);
}
