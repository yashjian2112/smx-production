import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ManualFinalLabel } from './ManualFinalLabel';

const PENDING_ACTION   = 'MANUAL_FINAL_LABEL_PENDING';
const CONFIRMED_ACTION = 'MANUAL_FINAL_LABEL_PRINT';
const ABANDONED_ACTION = 'MANUAL_FINAL_LABEL_ABANDONED';

const MONTH_CODES = ['JA','FE','MR','AP','MY','JN','JL','AU','SE','OC','NO','DE'] as const;

type BatchStatus = 'PENDING' | 'CONFIRMED' | 'ABANDONED';

type ManualBatch = {
  id: string;
  partyName: string;
  partyCode: string | null;
  stage: string;
  createdAt: string;
  confirmedAt: string | null;
  items: Array<{ serial: string; copies: number }>;
  status: BatchStatus;
};

function parseBatch(
  details: string | null,
  createdAt: Date,
  fallbackStatus: BatchStatus
): Omit<ManualBatch, 'id'> | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as {
      partyName?: unknown;
      partyCode?: unknown;
      stage?: unknown;
      generatedAt?: unknown;
      confirmedAt?: unknown;
      items?: unknown;
      status?: unknown;
    };
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const serial = 'serial' in item && typeof item.serial === 'string' ? item.serial.trim() : '';
            const copies = 'copies' in item && typeof item.copies === 'number' && item.copies > 0 ? item.copies : 1;
            return serial ? { serial, copies } : null;
          })
          .filter((item): item is { serial: string; copies: number } => item !== null)
      : [];

    if (items.length === 0) return null;

    const status: BatchStatus =
      parsed.status === 'CONFIRMED' ? 'CONFIRMED' :
      parsed.status === 'ABANDONED' ? 'ABANDONED' :
      fallbackStatus;

    return {
      partyName:  typeof parsed.partyName === 'string' && parsed.partyName.trim() ? parsed.partyName.trim() : 'Manual Party',
      partyCode:  typeof parsed.partyCode === 'string' && parsed.partyCode.trim() ? parsed.partyCode.trim() : null,
      stage:      typeof parsed.stage === 'string' && parsed.stage.trim() ? parsed.stage.trim() : 'FINAL_ASSEMBLY',
      createdAt:  typeof parsed.generatedAt === 'string' && parsed.generatedAt.trim()
        ? parsed.generatedAt
        : createdAt.toISOString(),
      confirmedAt: typeof parsed.confirmedAt === 'string' && parsed.confirmedAt.trim()
        ? parsed.confirmedAt
        : null,
      items,
      status,
    };
  } catch {
    return null;
  }
}

function buildFinalAssemblyPrefix(productCode: string): string {
  const year  = String(new Date().getFullYear() % 100).padStart(2, '0');
  const month = MONTH_CODES[new Date().getMonth()] ?? 'JA';
  return `${productCode.trim().toUpperCase()}${year}${month}`;
}

export default async function ManualFinalLabelPage({
  searchParams,
}: {
  searchParams: Promise<{ productCode?: string; productName?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  requireRole(session, 'ADMIN');

  const params = await searchParams;
  const initialProductCode = params.productCode?.trim().toUpperCase() ?? '';

  const [clients, logs] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      orderBy: { customerName: 'asc' },
      select: { id: true, code: true, customerName: true },
    }),
    prisma.auditLog.findMany({
      where: {
        entity: 'FINAL_ASSEMBLY_LABEL',
        action: { in: [PENDING_ACTION, CONFIRMED_ACTION, ABANDONED_ACTION] },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, action: true, details: true, createdAt: true },
    }),
  ]);

  // Compute initial next sequence from both DB and manual batches
  let initialNextSequence = 1;
  if (initialProductCode) {
    const prefix = buildFinalAssemblyPrefix(initialProductCode);

    const lastUnit = await prisma.controllerUnit.findFirst({
      where: { finalAssemblyBarcode: { not: null, startsWith: prefix } },
      orderBy: { finalAssemblyBarcode: 'desc' },
      select: { finalAssemblyBarcode: true },
    });
    const lastUnitSeq = lastUnit?.finalAssemblyBarcode
      ? parseInt(lastUnit.finalAssemblyBarcode.slice(prefix.length), 10) || 0
      : 0;

    let lastManualSeq = 0;
    for (const log of logs) {
      const p = parseBatch(log.details, log.createdAt, 'PENDING');
      if (!p) continue;
      for (const item of p.items) {
        if (item.serial.startsWith(prefix)) {
          const seq = parseInt(item.serial.slice(prefix.length), 10) || 0;
          if (seq > lastManualSeq) lastManualSeq = seq;
        }
      }
    }

    initialNextSequence = Math.max(lastUnitSeq, lastManualSeq) + 1;
  }

  const parsedLogs = logs
    .map((log) => {
      const fallback: BatchStatus =
        log.action === CONFIRMED_ACTION ? 'CONFIRMED' :
        log.action === ABANDONED_ACTION ? 'ABANDONED' :
        'PENDING';
      const parsed = parseBatch(log.details, log.createdAt, fallback);
      if (!parsed) return null;
      return { id: log.id, ...parsed };
    })
    .filter((item): item is ManualBatch => item !== null);

  const initialPending = parsedLogs.filter((log) => log.status === 'PENDING');
  const initialHistory = parsedLogs.filter((log) => log.status === 'CONFIRMED' || log.status === 'ABANDONED');

  return (
    <ManualFinalLabel
      initialProductCode={initialProductCode}
      initialProductName={params.productName ?? ''}
      initialNextSequence={initialNextSequence}
      clients={clients}
      initialPending={initialPending}
      initialHistory={initialHistory}
    />
  );
}
