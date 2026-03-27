import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();

    // Only ADMIN can change IG status
    if (session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;
    const body = await req.json();
    const { status, returnedDate } = body;

    if (!status || typeof status !== 'string') {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    const validStatuses = ['RECEIVED', 'IN_USE', 'RETURNED', 'RETAINED'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const existing = await prisma.implementationGood.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Implementation good not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { status };

    if (status === 'RETURNED') {
      updateData.returnedDate = returnedDate ? new Date(returnedDate) : new Date();
    }

    const updated = await prisma.implementationGood.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        igNumber: true,
        status: true,
        description: true,
        items: true,
        receivedDate: true,
        expectedReturn: true,
        returnedDate: true,
        purpose: true,
        notes: true,
        createdAt: true,
        client: { select: { id: true, code: true, customerName: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      ...updated,
      receivedDate:   updated.receivedDate.toISOString(),
      expectedReturn: updated.expectedReturn?.toISOString() ?? null,
      returnedDate:   updated.returnedDate?.toISOString()   ?? null,
      createdAt:      updated.createdAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
