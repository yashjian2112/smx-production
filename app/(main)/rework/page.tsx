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

function StatusBadge({ status }: { status: string }) {
  const st = STATUS_STYLES[status] ?? STATUS_STYLES.REPORTED;
  return (
    <span
      className="text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: st.bg, color: st.color }}
    >
      {st.text}
    </span>
  );
}

export default async function ReworkPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER', 'SALES'].includes(session.role)) redirect('/dashboard');

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
  }));

  const active    = items.filter((i) => !['CLOSED', 'REJECTED', 'DISPATCHED'].includes(i.status));
  const inRepair  = items.filter((i) => i.status === 'IN_REPAIR');
  const completed = items.filter((i) => ['CLOSED', 'REJECTED', 'DISPATCHED', 'REPAIRED', 'QC_CHECKED'].includes(i.status));
  const pending   = items.filter((i) => ['REPORTED', 'EVALUATED', 'APPROVED', 'UNIT_RECEIVED'].includes(i.status));

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Customer Returns</h2>
          <p className="text-xs text-slate-500 mt-0.5">Replacement requests — units requiring diagnosis and repair</p>
        </div>
        {['ADMIN', 'SALES'].includes(session.role) && (
          <Link
            href="/rework/new"
            className="px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: '#0ea5e9' }}
          >
            + New Replacement
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Pending',   count: pending.length,   color: '#fbbf24' },
          { label: 'In Repair', count: inRepair.length,  color: '#f97316' },
          { label: 'Total',     count: items.length,     color: '#38bdf8' },
        ].map((st) => (
          <div key={st.label} className="card p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: st.color }}>{st.count}</div>
            <div className="text-xs text-slate-500 mt-0.5">{st.label}</div>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="flex justify-center mb-3"><Package className="w-4 h-4" /></div>
          <p className="text-slate-400 text-sm">No replacement requests yet.</p>
          <p className="text-slate-600 text-xs mt-1">When a return is logged, it will appear here.</p>
        </div>
      ) : (
        <>
          {[
            { title: 'Awaiting Action', list: pending, accent: '#fbbf24' },
            { title: 'In Repair', list: inRepair, accent: '#f97316' },
            { title: 'Completed / Closed', list: completed, accent: '#71717a' },
          ].map(({ title, list, accent }) =>
            list.length > 0 ? (
              <div key={title}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full" style={{ background: accent }} />
                  <h3 className="text-sm font-semibold text-white">{title}</h3>
                  <span className="text-xs text-slate-600">({list.length})</span>
                </div>
                <div className="space-y-3">
                  {list.map((item) => (
                    <ReturnCard key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ) : null
          )}
        </>
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
            {/* Top row */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-mono text-sky-400">{item.returnNumber}</span>
              <StatusBadge status={item.status} />
              <span className="text-[10px] text-slate-600">{date}</span>
            </div>

            {/* Client */}
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-full bg-sky-900/50 border border-sky-700/30 flex items-center justify-center text-[9px] font-semibold text-sky-300">
                {item.clientName.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-white">{item.clientName}</span>
              <span className="text-[10px] text-slate-600 font-mono">{item.clientCode}</span>
            </div>

            {/* Unit serial */}
            {item.serialNumber && (
              <div className="flex items-center gap-2 mb-2 p-2 rounded-lg" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}>
                <svg className="w-3.5 h-3.5 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                <span className="text-xs font-mono text-sky-300">{item.serialNumber}</span>
              </div>
            )}

            {/* Problem */}
            <div className="p-2 rounded-lg mb-2" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-[9px] font-semibold text-amber-500 uppercase tracking-wider mb-0.5">Reported Issue</p>
              <p className="text-xs text-amber-200 line-clamp-2">{item.reportedIssue}</p>
            </div>

            {/* Resolution if set */}
            {item.resolution && (
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] text-zinc-500">Resolution:</span>
                <span className="text-[10px] font-medium text-emerald-400">{item.resolution}</span>
              </div>
            )}

            {/* Created by */}
            <p className="text-[10px] text-slate-600">Logged by {item.createdByName}</p>
          </div>
          <svg className="text-zinc-600 shrink-0 mt-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        </div>
      </div>
    </Link>
  );
}
