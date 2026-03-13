import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type IncomingItem = {
  serial?: unknown;
  copies?: unknown;
};

function normalizeItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const incoming = item as IncomingItem;
      const serial = typeof incoming?.serial === 'string' ? incoming.serial.trim().toUpperCase() : '';
      const copies = typeof incoming?.copies === 'number' && incoming.copies > 0 ? Math.min(20, Math.floor(incoming.copies)) : 1;
      return serial ? { serial, copies } : null;
    })
    .filter((item): item is { serial: string; copies: number } => item !== null)
    .slice(0, 100);
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const body = await req.json();
    const stage = body?.stage === 'FINAL_ASSEMBLY' ? 'FINAL_ASSEMBLY' : null;
    const clientId = typeof body?.clientId === 'string' && body.clientId.trim() ? body.clientId.trim() : null;
    const manualPartyName = typeof body?.partyName === 'string' ? body.partyName.trim() : '';
    const productCode = typeof body?.productCode === 'string' ? body.productCode.trim().toUpperCase() : '';
    const productName = typeof body?.productName === 'string' ? body.productName.trim() : '';
    const prefix = typeof body?.prefix === 'string' ? body.prefix.trim().toUpperCase() : '';
    const items = normalizeItems(body?.items);

    if (!stage) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
    if (!productCode) return NextResponse.json({ error: 'Product code is required' }, { status: 400 });
    if (!prefix) return NextResponse.json({ error: 'Prefix is required' }, { status: 400 });
    if (items.length === 0) return NextResponse.json({ error: 'No barcodes to save' }, { status: 400 });

    const client = clientId
      ? await prisma.client.findUnique({
          where: { id: clientId },
          select: { id: true, code: true, customerName: true },
        })
      : null;

    if (clientId && !client) {
      return NextResponse.json({ error: 'Selected party not found' }, { status: 404 });
    }

    const partyName = client?.customerName ?? manualPartyName;
    if (!partyName) {
      return NextResponse.json({ error: 'Party details are required' }, { status: 400 });
    }

    const payload = {
      stage,
      productCode,
      productName: productName || null,
      prefix,
      partyName,
      partyCode: client?.code ?? null,
      clientId: client?.id ?? null,
      items,
      totalStickers: items.reduce((sum, item) => sum + item.copies, 0),
      source: 'manual-admin',
    };

    const log = await prisma.auditLog.create({
      data: {
        userId: session.id,
        action: 'MANUAL_FINAL_LABEL_PRINT',
        entity: 'FINAL_ASSEMBLY_LABEL',
        entityId: items[0]?.serial ?? null,
        details: JSON.stringify(payload),
      },
    });

    return NextResponse.json({
      batch: {
        id: log.id,
        partyName: payload.partyName,
        partyCode: payload.partyCode,
        stage: payload.stage,
        createdAt: log.createdAt.toISOString(),
        items: payload.items,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    console.error(error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
