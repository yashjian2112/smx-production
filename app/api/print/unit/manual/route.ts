import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const PENDING_ACTION   = 'MANUAL_FINAL_LABEL_PENDING';
const CONFIRMED_ACTION = 'MANUAL_FINAL_LABEL_PRINT';
const ABANDONED_ACTION = 'MANUAL_FINAL_LABEL_ABANDONED';
const ENTITY           = 'FINAL_ASSEMBLY_LABEL';

const MONTH_CODES = ['JA','FE','MR','AP','MY','JN','JL','AU','SE','OC','NO','DE'] as const;

type IncomingItem = {
  serial?: unknown;
  copies?: unknown;
};

type StoredPayload = {
  stage: string;
  productCode: string;
  productName: string | null;
  prefix: string;
  partyName: string;
  partyCode: string | null;
  clientId: string | null;
  items: Array<{ serial: string; copies: number }>;
  totalStickers: number;
  source: 'manual-admin';
  status: 'PENDING' | 'CONFIRMED' | 'ABANDONED';
  generatedAt: string;
  confirmedAt: string | null;
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

function normalizeBatchIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter(Boolean)
    .slice(0, 100);
}

function parsePayload(details: string | null) {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as Partial<StoredPayload>;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildFinalAssemblyPrefix(productCode: string): string {
  const year  = String(new Date().getFullYear() % 100).padStart(2, '0');
  const month = MONTH_CODES[new Date().getMonth()] ?? 'JA';
  return `${productCode}${year}${month}`;
}

// ── GET: return next sequence for productCode ────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const { searchParams } = new URL(req.url);
    const productCode = searchParams.get('productCode')?.trim().toUpperCase() ?? '';

    if (!productCode) {
      return NextResponse.json({ nextSequence: 1, prefix: '' });
    }

    const prefix = buildFinalAssemblyPrefix(productCode);

    // Last barcode in ControllerUnit table
    const lastUnit = await prisma.controllerUnit.findFirst({
      where: { finalAssemblyBarcode: { not: null, startsWith: prefix } },
      orderBy: { finalAssemblyBarcode: 'desc' },
      select: { finalAssemblyBarcode: true },
    });
    const lastUnitSeq = lastUnit?.finalAssemblyBarcode
      ? parseInt(lastUnit.finalAssemblyBarcode.slice(prefix.length), 10) || 0
      : 0;

    // Last sequence used in manual batches (pending + confirmed + abandoned)
    const manualLogs = await prisma.auditLog.findMany({
      where: {
        entity: ENTITY,
        action: { in: [PENDING_ACTION, CONFIRMED_ACTION, ABANDONED_ACTION] },
      },
      select: { details: true },
    });

    let lastManualSeq = 0;
    for (const log of manualLogs) {
      const p = parsePayload(log.details);
      if (!p || !Array.isArray(p.items)) continue;
      for (const item of p.items as Array<{ serial: string; copies: number }>) {
        if (typeof item.serial === 'string' && item.serial.startsWith(prefix)) {
          const seq = parseInt(item.serial.slice(prefix.length), 10) || 0;
          if (seq > lastManualSeq) lastManualSeq = seq;
        }
      }
    }

    const nextSequence = Math.max(lastUnitSeq, lastManualSeq) + 1;
    return NextResponse.json({ nextSequence, prefix });
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

// ── POST: generate new manual batch (pending) ────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const body = await req.json();
    const stage         = body?.stage === 'FINAL_ASSEMBLY' ? 'FINAL_ASSEMBLY' : null;
    const clientId      = typeof body?.clientId === 'string' && body.clientId.trim() ? body.clientId.trim() : null;
    const manualPartyName = typeof body?.partyName === 'string' ? body.partyName.trim() : '';
    const productCode   = typeof body?.productCode === 'string' ? body.productCode.trim().toUpperCase() : '';
    const productName   = typeof body?.productName === 'string' ? body.productName.trim() : '';
    const prefix        = typeof body?.prefix === 'string' ? body.prefix.trim().toUpperCase() : '';
    const items         = normalizeItems(body?.items);

    if (!stage)          return NextResponse.json({ error: 'Invalid stage' },           { status: 400 });
    if (!productCode)    return NextResponse.json({ error: 'Product code is required' }, { status: 400 });
    if (!prefix)         return NextResponse.json({ error: 'Prefix is required' },       { status: 400 });
    if (items.length === 0) return NextResponse.json({ error: 'No barcodes to save' },  { status: 400 });

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

    const generatedAt = new Date().toISOString();
    const payload: StoredPayload = {
      stage,
      productCode,
      productName: productName || null,
      prefix,
      partyName,
      partyCode: client?.code ?? null,
      clientId:  client?.id  ?? null,
      items,
      totalStickers: items.reduce((sum, item) => sum + item.copies, 0),
      source: 'manual-admin',
      status: 'PENDING',
      generatedAt,
      confirmedAt: null,
    };

    const log = await prisma.auditLog.create({
      data: {
        userId:   session.id,
        action:   PENDING_ACTION,
        entity:   ENTITY,
        entityId: items[0]?.serial ?? null,
        details:  JSON.stringify(payload),
      },
    });

    return NextResponse.json({
      batch: {
        id:          log.id,
        partyName:   payload.partyName,
        partyCode:   payload.partyCode,
        stage:       payload.stage,
        createdAt:   payload.generatedAt,
        confirmedAt: null,
        items:       payload.items,
        status:      'PENDING' as const,
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

// ── PATCH: confirm or abandon pending batch(es) ──────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN');

    const body     = await req.json();
    const batchIds = normalizeBatchIds(body?.batchIds);
    const abandon  = body?.action === 'abandon';

    if (batchIds.length === 0) {
      return NextResponse.json({ error: 'No pending batches selected' }, { status: 400 });
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        id:     { in: batchIds },
        action: PENDING_ACTION,
        entity: ENTITY,
      },
      select: { id: true, details: true },
    });

    if (logs.length === 0) {
      return NextResponse.json({ error: 'Pending batches not found' }, { status: 404 });
    }

    const processedAt  = new Date().toISOString();
    const targetAction = abandon ? ABANDONED_ACTION : CONFIRMED_ACTION;
    const newStatus: StoredPayload['status'] = abandon ? 'ABANDONED' : 'CONFIRMED';

    const updates = logs
      .map((log) => {
        const payload = parsePayload(log.details);
        if (!payload) return null;
        const nextPayload: StoredPayload = {
          stage:         typeof payload.stage       === 'string' ? payload.stage       : 'FINAL_ASSEMBLY',
          productCode:   typeof payload.productCode === 'string' ? payload.productCode : '',
          productName:   typeof payload.productName === 'string' ? payload.productName : null,
          prefix:        typeof payload.prefix      === 'string' ? payload.prefix      : '',
          partyName:     typeof payload.partyName   === 'string' ? payload.partyName   : 'Manual Party',
          partyCode:     typeof payload.partyCode   === 'string' ? payload.partyCode   : null,
          clientId:      typeof payload.clientId    === 'string' ? payload.clientId    : null,
          items:         normalizeItems(payload.items),
          totalStickers:
            typeof payload.totalStickers === 'number'
              ? payload.totalStickers
              : normalizeItems(payload.items).reduce((sum, item) => sum + item.copies, 0),
          source:       'manual-admin',
          status:       newStatus,
          generatedAt:  typeof payload.generatedAt === 'string' && payload.generatedAt
            ? payload.generatedAt
            : processedAt,
          confirmedAt: processedAt,
        };
        return { id: log.id, payload: nextPayload };
      })
      .filter(
        (item): item is { id: string; payload: StoredPayload } =>
          item !== null && item.payload.items.length > 0
      );

    await prisma.$transaction(
      updates.map((update) =>
        prisma.auditLog.update({
          where: { id: update.id },
          data: {
            action:  targetAction,
            details: JSON.stringify(update.payload),
          },
        })
      )
    );

    return NextResponse.json({
      batches: updates.map((update) => ({
        id:          update.id,
        partyName:   update.payload.partyName,
        partyCode:   update.payload.partyCode,
        stage:       update.payload.stage,
        createdAt:   update.payload.generatedAt,
        confirmedAt: update.payload.confirmedAt,
        items:       update.payload.items,
        status:      update.payload.status,
      })),
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
