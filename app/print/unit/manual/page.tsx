import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ManualFinalLabel } from './ManualFinalLabel';

const PENDING_ACTION = 'MANUAL_FINAL_LABEL_PENDING';
const CONFIRMED_ACTION = 'MANUAL_FINAL_LABEL_PRINT';

type ManualBatch = {
  id: string;
  partyName: string;
  partyCode: string | null;
  stage: string;
  createdAt: string;
  confirmedAt: string | null;
  items: Array<{ serial: string; copies: number }>;
};

function parseBatch(details: string | null, createdAt: Date): Omit<ManualBatch, 'id'> | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as {
      partyName?: unknown;
      partyCode?: unknown;
      stage?: unknown;
      generatedAt?: unknown;
      confirmedAt?: unknown;
      items?: unknown;
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

    return {
      partyName: typeof parsed.partyName === 'string' && parsed.partyName.trim() ? parsed.partyName.trim() : 'Manual Party',
      partyCode: typeof parsed.partyCode === 'string' && parsed.partyCode.trim() ? parsed.partyCode.trim() : null,
      stage: typeof parsed.stage === 'string' && parsed.stage.trim() ? parsed.stage.trim() : 'FINAL_ASSEMBLY',
      createdAt:
        typeof parsed.generatedAt === 'string' && parsed.generatedAt.trim()
          ? parsed.generatedAt
          : createdAt.toISOString(),
      confirmedAt:
        typeof parsed.confirmedAt === 'string' && parsed.confirmedAt.trim()
          ? parsed.confirmedAt
          : null,
      items,
    };
  } catch {
    return null;
  }
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
  const [clients, logs] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      orderBy: { customerName: 'asc' },
      select: { id: true, code: true, customerName: true },
    }),
    prisma.auditLog.findMany({
      where: {
        entity: 'FINAL_ASSEMBLY_LABEL',
        action: { in: [PENDING_ACTION, CONFIRMED_ACTION] },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, action: true, details: true, createdAt: true },
    }),
  ]);

  const parsedLogs = logs
    .map((log) => {
      const parsed = parseBatch(log.details, log.createdAt);
      if (!parsed) return null;
      return {
        id: log.id,
        action: log.action,
        ...parsed,
      };
    })
    .filter(
      (
        item
      ): item is ManualBatch & {
        action: string;
      } => item !== null
    );

  const initialPending = parsedLogs.filter((log) => log.action === PENDING_ACTION).map(({ action: _action, ...rest }) => rest);
  const initialHistory = parsedLogs.filter((log) => log.action === CONFIRMED_ACTION).map(({ action: _action, ...rest }) => rest);

  return (
    <ManualFinalLabel
      initialProductCode={params.productCode ?? ''}
      initialProductName={params.productName ?? ''}
      clients={clients}
      initialPending={initialPending}
      initialHistory={initialHistory}
    />
  );
}
