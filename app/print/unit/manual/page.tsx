import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ManualFinalLabel } from './ManualFinalLabel';

type ManualHistoryBatch = {
  id: string;
  partyName: string;
  partyCode: string | null;
  stage: string;
  createdAt: string;
  items: Array<{ serial: string; copies: number }>;
};

function parseHistory(details: string | null): Omit<ManualHistoryBatch, 'id' | 'createdAt'> | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as {
      partyName?: unknown;
      partyCode?: unknown;
      stage?: unknown;
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
        action: 'MANUAL_FINAL_LABEL_PRINT',
        entity: 'FINAL_ASSEMBLY_LABEL',
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, details: true, createdAt: true },
    }),
  ]);

  const initialHistory: ManualHistoryBatch[] = logs
    .map((log) => {
      const parsed = parseHistory(log.details);
      if (!parsed) return null;
      return {
        id: log.id,
        createdAt: log.createdAt.toISOString(),
        ...parsed,
      };
    })
    .filter((item): item is ManualHistoryBatch => item !== null);

  return (
    <ManualFinalLabel
      initialProductCode={params.productCode ?? ''}
      initialProductName={params.productName ?? ''}
      clients={clients}
      initialHistory={initialHistory}
    />
  );
}
