import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireSession();

    // Only ADMIN and ACCOUNTS can update status; SALES cannot PATCH
    if (!['ADMIN', 'ACCOUNTS'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = params;
    const body = await req.json();
    const { status } = body;

    if (!status || typeof status !== 'string') {
      return NextResponse.json({ error: 'status is required' }, { status: 400 });
    }

    const validStatuses = ['PENDING', 'APPROVED', 'DISPATCHED', 'RETURNED', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
    }

    const existing = await prisma.sampleRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Sample request not found' }, { status: 404 });
    }

    // Build update data with timestamp fields
    const updateData: Record<string, unknown> = { status };

    if (status === 'APPROVED') {
      updateData.approvedById = session.id;
      updateData.approvedAt = new Date();
    } else if (status === 'DISPATCHED') {
      updateData.dispatchedAt = new Date();
    } else if (status === 'RETURNED') {
      updateData.returnedAt = new Date();
    }

    const updated = await prisma.sampleRequest.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        sampleNumber: true,
        status: true,
        quantity: true,
        description: true,
        notes: true,
        createdAt: true,
        approvedAt: true,
        dispatchedAt: true,
        returnedAt: true,
        client: { select: { id: true, code: true, customerName: true } },
        product: { select: { id: true, code: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      ...updated,
      createdAt:    updated.createdAt.toISOString(),
      approvedAt:   updated.approvedAt?.toISOString()   ?? null,
      dispatchedAt: updated.dispatchedAt?.toISOString() ?? null,
      returnedAt:   updated.returnedAt?.toISOString()   ?? null,
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
