import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await requireSession();
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { faceDescriptor: true, faceEnrolled: true },
    });
    if (!user || !user.faceEnrolled || !user.faceDescriptor) {
      return NextResponse.json({ enrolled: false, descriptor: null }, { status: 404 });
    }
    return NextResponse.json({ enrolled: true, descriptor: user.faceDescriptor });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
