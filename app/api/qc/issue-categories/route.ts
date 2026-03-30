import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireSession();
    const categories = await prisma.issueCategory.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
    return NextResponse.json(categories);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
