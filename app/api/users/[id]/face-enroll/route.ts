import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  descriptor: z.string().min(1), // JSON array of 128 floats
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json({ error: 'Invalid descriptor' }, { status: 400 });

    // Validate it's actually a 128-element array
    let arr: number[];
    try {
      arr = JSON.parse(parsed.data.descriptor);
    } catch {
      return NextResponse.json({ error: 'Invalid descriptor format' }, { status: 400 });
    }
    if (!Array.isArray(arr) || arr.length !== 128)
      return NextResponse.json({ error: 'Descriptor must be 128 numbers' }, { status: 400 });

    await prisma.user.update({
      where: { id: params.id },
      data: { faceDescriptor: parsed.data.descriptor, faceEnrolled: true },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
