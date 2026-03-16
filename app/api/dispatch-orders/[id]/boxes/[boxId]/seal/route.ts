import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; boxId: string } }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'PRODUCTION_EMPLOYEE');

    // Fetch the dispatch order
    const dispatchOrder = await prisma.dispatchOrder.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    });
    if (!dispatchOrder) return NextResponse.json({ error: 'Dispatch order not found' }, { status: 404 });
    if (dispatchOrder.status !== 'PACKING')
      return NextResponse.json({ error: 'Dispatch order must be in PACKING status to seal boxes' }, { status: 400 });

    // Fetch the box with item count
    const box = await prisma.packingBox.findUnique({
      where: { id: params.boxId },
      include: {
        _count: { select: { items: true } },
      },
    });
    if (!box) return NextResponse.json({ error: 'Box not found' }, { status: 404 });
    if (box.dispatchOrderId !== params.id)
      return NextResponse.json({ error: 'Box does not belong to this dispatch order' }, { status: 400 });
    if (box.isSealed)
      return NextResponse.json({ error: 'Box is already sealed' }, { status: 400 });
    if (box._count.items === 0)
      return NextResponse.json({ error: 'Box must have at least 1 item before sealing' }, { status: 400 });

    // Parse FormData
    const formData = await req.formData();
    const file = formData.get('photo') as File | null;
    if (!file) return NextResponse.json({ error: 'Photo file is required' }, { status: 400 });

    // Determine extension from MIME type
    const mime = file.type;
    let ext = 'jpg';
    if (mime === 'image/png') ext = 'png';
    else if (mime === 'image/webp') ext = 'webp';
    else if (mime === 'image/jpeg' || mime === 'image/jpg') ext = 'jpg';
    else if (mime === 'image/gif') ext = 'gif';

    // Upload to Vercel Blob
    const blob = await put(
      `dispatch-orders/${params.id}/box-${params.boxId}.${ext}`,
      file,
      { access: 'public' }
    );

    // Update box: sealed + photoUrl
    const updatedBox = await prisma.packingBox.update({
      where: { id: params.boxId },
      data: { isSealed: true, photoUrl: blob.url },
      include: {
        items: {
          orderBy: { scannedAt: 'asc' },
          include: {
            unit: { select: { serialNumber: true, finalAssemblyBarcode: true } },
          },
        },
      },
    });

    return NextResponse.json(updatedBox);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
