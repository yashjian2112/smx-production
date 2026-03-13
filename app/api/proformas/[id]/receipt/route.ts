import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';

const MAX_SIZE_MB = 10;
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

/** POST /api/proformas/[id]/receipt — upload payment receipt (PDF or image) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'SALES', 'ACCOUNTS');

    const existing = await prisma.proformaInvoice.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Only the creator, ADMIN or ACCOUNTS can upload
    if (session.role === 'SALES' && existing.createdById !== session.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Must be DRAFT or PENDING_APPROVAL to upload
    if (!['DRAFT', 'PENDING_APPROVAL'].includes(existing.status))
      return NextResponse.json({ error: 'Cannot upload receipt on an already-approved or converted invoice' }, { status: 400 });

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Size check
    if (file.size > MAX_SIZE_MB * 1024 * 1024)
      return NextResponse.json({ error: `File too large. Max ${MAX_SIZE_MB}MB.` }, { status: 400 });

    // Type check
    const contentType = file.type || 'application/octet-stream';
    if (!ALLOWED_TYPES.includes(contentType))
      return NextResponse.json({ error: 'Only PDF, JPG, PNG or WEBP allowed' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase() || (contentType === 'application/pdf' ? 'pdf' : 'jpg');
    const buffer = Buffer.from(await file.arrayBuffer());

    const blob = await put(
      `pi-receipts/${params.id}/${Date.now()}.${ext}`,
      buffer,
      { access: 'private', contentType }
    );

    const updated = await prisma.proformaInvoice.update({
      where: { id: params.id },
      data: { paymentReceiptUrl: blob.url },
      select: { id: true, paymentReceiptUrl: true },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** DELETE /api/proformas/[id]/receipt — remove attached receipt */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'SALES');

    const existing = await prisma.proformaInvoice.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (session.role === 'SALES' && existing.createdById !== session.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await prisma.proformaInvoice.update({
      where: { id: params.id },
      data: { paymentReceiptUrl: null },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (e instanceof Error && e.message === 'Forbidden')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
