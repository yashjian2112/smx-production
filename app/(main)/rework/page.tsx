import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Package } from 'lucide-react';

type ReturnItem = {
  id: string;
  returnNumber: string;
  serialNumber: string | null;
  reportedIssue: string;
  status: string;
  type: string;
  resolution: string | null;
  clientName: string;
  clientCode: string;
  createdByName: string;
  evaluatedByName: string | null;
  createdAt: string;
  batchId: string | null;
};

const STATUS_STYLES: Record<string, { bg: string; color: string; text: string }> = {
  REPORTED:      { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', text: 'Reported' },
  EVALUATED:     { bg: 'rgba(56,189,248,0.12)',  color: '#38bdf8', text: 'Evaluated' },
  APPROVED:      { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', text: 'Approved' },
  UNIT_RECEIVED: { bg: 'rgba(168,85,247,0.12)',  color: '#a855f7', text: 'Unit Received' },
  IN_REPAIR:     { bg: 'rgba(249,115,22,0.12)',  color: '#f97316', text: 'In Repair' },
  REPAIRED:      { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', text: 'Repaired' },
  QC_CHECKED:    { bg: 'rgba(56,189,248,0.12)',  color: '#38bdf8', text: 'QC Checked' },
  DISPATCHED:    { bg: 'rgba(99,102,241,0.12)',  color: '#6366f1', text: 'Dispatched' },
  CLOSED:        { bg: 'rgba(113,113,122,0.15)', color: '#a1a1aa', text: 'Closed' },
  REJECTED:      { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', text: 'Rejected' },
};

const PENDING_STATUSES  = ['REPORTED', 'EVALUATED', 'APPROVED', 'UNIT_RECEIVED'];
const IN_REPAIR_STATUSES = ['IN_REPAIR'];
const DONE_STATUSES     = ['REPAIRED', 'QC_CHECKED', 'DISPATCHED', 'CLOSED', 'REJECTED'];

function StatusBadge({ status }: { status: string }) {
  const st = STATUS_STYLES[status] ?? STATUS_STYLES.REPORTED;
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: st.bg, color: st.color }}>
      {st.text}
    </span>
  );
}

type DisplayGroup =
  | { kind: 'single'; item: ReturnItem }
  | { kind: 'batch';  items: ReturnItem[] };

function buildGroups(items: ReturnItem[]): DisplayGroup[] {
  const batches = new Map<string, ReturnItem[]>();
  const groups: DisplayGroup[] = [];
  for (const item of items) {
    if (!item.batchId) {
      groups.push({ kind: 'single', item });
    } else {
      const existing = batches.get(item.batchId);
      if (existing) {
        existing.push(item);
      } else {
        const arr: ReturnItem[] = [item];
        batches.set(item.batchId, arr);
        groups.push({ kind: 'batch', items: arr });
      }
    }
  }
  return groups;
}

const STATUS_ORDER = ['IN_REPAIR', 'REPORTED', 'UNIT_RECEIVED', 'APPROVED', 'EVALUATED', 'REPAIRED', 'QC_CHECKED', 'DISPATCHED', 'CLOSED', 'REJECTED'];

export default async function ReworkPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER', 'SALES'].includes(session.role)) redirect('/dashboard');

  const { tab: rawTab } = await searchParams;
  const tab = rawTab === 'in_repair' ? 'in_repair' : rawTab === 'completed' ? 'completed' : 'pending';

  const raw = await prisma.returnRequest.findMany({
    include: {
      client:      { select: { customerName: true, code: true } },
      reportedBy:  { select: { name: true } },
      evaluatedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const items: ReturnItem[] = raw.map((r) => ({
    id:              r.id,
    returnNumber:    r.returnNumber,
    serialNumber:    r.serialNumber,
    reportedIssue:   r.reportedIssue,
    status:          r.status,
    type:            r.type,
    resolution:      r.resolution,
    clientName:      r.client.customerName,
    clientCode:      r.client.code,
    createdByName:   r.reportedBy.name,
    evaluatedByName: r.evaluatedBy?.name ?? null,
    createdAt:       r.createdAt.toISOString(),
    batchId:         r.batchId,
  }));

  const pendingItems  = items.filter(i => PENDING_STATUSES.includes(i.status));
  const inRepairItems = items.filter(i => IN_REPAIR_STATUSES.includes(i.status));
  const doneItems     = items.filter(i => DONE_STATUSES.includes(i.status));

  const activeItems =
    tab === 'in_repair' ? inRepairItems :
    tab === 'completed' ? doneItems :
    pendingItems;

  const groups = buildGroups(activeItems);

  const TABS = [
    { key: 'pending',   label: 'Pending',   count: pendingItems.length,  accent: '#fbbf24' },
    { key: 'in_repair', label: 'In Repair',  count: inRepairItems.length, accent: '#f97316' },
    { key: 'completed', label: 'Completed',  count: doneItems.length,     accent: '#71717a' },
  ];

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Customer Returns</h2>
          <p className="text-xs text-slate-500 mt-0.5">Replacement requests — units requiring diagnosis and repair</p>
        </div>
        {['ADMIN', 'SALES'].includes(session.role) && (
          <Link href="/rework/new"
            className="px-3 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: '#0ea5e9' }}>
            + New Replacement
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {TABS.map(t => (
          <div key={t.key} className="card p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: t.accent }}>{t.count}</div>
            <div className="text-xs text-slate-500 mt-0.5">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {TABS.map(t => (
          <Link key={t.key} href={`/rework?tab=${t.key}`}
            className={`flex-1 py-2 rounded-lg text-sm font-medium text-center transition-all ${
              tab === t.key ? 'text-white shadow-lg' : 'text-zinc-400 hover:text-white'
            }`}
            style={tab === t.key ? { background: t.accent === '#fbbf24' ? '#b45309' : t.accent === '#f97316' ? '#c2410c' : '#52525b' } : {}}>
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 text-[10px] font-semibold opacity-80">({t.count})</span>
            )}
          </Link>
        ))}
      </div>

      {/* Content */}
      {groups.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="flex justify-center mb-3"><Package className="w-4 h-4 text-zinc-600" /></div>
          <p className="text-slate-400 text-sm">
            {tab === 'pending'   ? 'No pending requests.' :
             tab === 'in_repair' ? 'Nothing currently in repair.' :
             'No completed returns yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g =>
            g.kind === 'single'
              ? <ReturnCard key={g.item.id} item={g.item} />
              : <BatchCard  key={g.items[0].batchId} items={g.items} />
          )}
        </div>
      )}
    </div>
  );
}

function ReturnCard({ item }: { item: ReturnItem }) {
  const date = new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

  return (
    <Link href={`/rework/${item.id}`} className="block">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-mono text-sky-400">{item.returnNumber}</span>
              <StatusBadge status={item.status} />
              <span className="text-[10px] text-slate-600">{date}</span>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-sky-900/50 border border-sky-700/30 flex items-center justify-center text-[9px] font-semibold text-sky-300">
                {item.clientName.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-white">{item.clientName}</span>
              <span className="text-[10px] text-slate-600 font-mono">{item.clientCode}</span>
            </div>

            {item.serialNumber && (
              <div className="flex items-center gap-2 mb-2 p-2 rounded-lg" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}>
                <svg className="w-3.5 h-3.5 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                <span className="text-xs font-mono text-sky-300">{item.serialNumber}</span>
              </div>
            )}

            <div className="p-2 rounded-lg mb-2" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-[9px] font-semibold text-amber-500 uppercase tracking-wider mb-0.5">Reported Issue</p>
              <p className="text-xs text-amber-200 line-clamp-2">{item.reportedIssue}</p>
            </div>

            {item.resolution && (
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] text-zinc-500">Resolution:</span>
                <span className="text-[10px] font-medium text-emerald-400">{item.resolution}</span>
              </div>
            )}

            <p className="text-[10px] text-slate-600">Logged by {item.createdByName}</p>
          </div>
          <svg className="text-zinc-600 shrink-0 mt-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        </div>
      </div>
    </Link>
  );
}

function BatchCard({ items }: { items: ReturnItem[] }) {
  const first     = items[0];
  const date      = new Date(first.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  const repStatus = items
    .map(i => i.status)
    .sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))[0] ?? first.status;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
              Batch · {items.length} units
            </span>
            <StatusBadge status={repStatus} />
            <span className="text-[10px] text-slate-600">{date}</span>
          </div>

          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-sky-900/50 border border-sky-700/30 flex items-center justify-center text-[9px] font-semibold text-sky-300">
              {first.clientName.slice(0, 2).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-white">{first.clientName}</span>
            <span className="text-[10px] text-slate-600 font-mono">{first.clientCode}</span>
          </div>

          <div className="p-2 rounded-lg mb-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
            <p className="text-[9px] font-semibold text-amber-500 uppercase tracking-wider mb-0.5">Reported Issue</p>
            <p className="text-xs text-amber-200 line-clamp-2">{first.reportedIssue}</p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {items.map((item) => (
          <Link key={item.id} href={`/rework/${item.id}`}
            className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:border-zinc-600"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <svg className="w-3 h-3 text-sky-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
            <span className="text-xs font-mono text-sky-300 flex-1">{item.serialNumber ?? '—'}</span>
            <span className="text-[10px] font-mono text-zinc-500">{item.returnNumber}</span>
            <StatusBadge status={item.status} />
            <svg className="text-zinc-600 shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
          </Link>
        ))}
      </div>

      <p className="text-[10px] text-slate-600 mt-2">Logged by {first.createdByName}</p>
    </div>
  );
}
