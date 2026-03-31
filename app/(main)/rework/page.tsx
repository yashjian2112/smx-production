import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Package, Wrench, AlertTriangle } from 'lucide-react';

type ReturnItem = {
  id: string;
  returnNumber: string;
  serialNumber: string | null;
  reportedIssue: string;
  status: string;
  type: string;
  resolution: string | null;
  faultType: string | null;
  faultApproval: string | null;
  clientName: string;
  clientCode: string;
  createdByName: string;
  evaluatedByName: string | null;
  createdAt: string;
  batchId: string | null;
  origin: 'replacement';
};

type QCFailItem = {
  id: string;
  unitId: string;
  unitSerial: string;
  orderNumber: string;
  productName: string;
  status: string;
  cycleCount: number;
  assignedTo: string | null;
  createdAt: string;
  origin: 'qc_failure';
};

type UnifiedItem = ReturnItem | QCFailItem;

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
  OPEN:          { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', text: 'Open' },
  IN_PROGRESS:   { bg: 'rgba(249,115,22,0.12)',  color: '#f97316', text: 'In Progress' },
  COMPLETED:     { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', text: 'Completed' },
  SENT_TO_QC:    { bg: 'rgba(56,189,248,0.12)',  color: '#38bdf8', text: 'Sent to QC' },
};

const RETURN_PENDING   = ['REPORTED', 'EVALUATED', 'APPROVED', 'UNIT_RECEIVED'];
const RETURN_ACTIVE    = ['IN_REPAIR', 'REPAIRED', 'QC_CHECKED'];
const RETURN_DONE      = ['DISPATCHED', 'CLOSED', 'REJECTED'];

const REWORK_ACTIVE    = ['OPEN', 'IN_PROGRESS', 'SENT_TO_QC'];
const REWORK_DONE      = ['COMPLETED'];

function StatusBadge({ status }: { status: string }) {
  const st = STATUS_STYLES[status] ?? STATUS_STYLES.REPORTED;
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: st.bg, color: st.color }}>
      {st.text}
    </span>
  );
}

function OriginBadge({ origin }: { origin: 'replacement' | 'qc_failure' }) {
  if (origin === 'qc_failure') {
    return (
      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
        style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
        QC Failure
      </span>
    );
  }
  return (
    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
      style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
      Replacement
    </span>
  );
}

export default async function ReworkPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER', 'SALES', 'QC_USER'].includes(session.role)) redirect('/dashboard');

  const { tab: rawTab } = await searchParams;
  const tab = rawTab === 'active' ? 'active' : rawTab === 'completed' ? 'completed' : 'pending';

  // Fetch return requests
  const raw = await prisma.returnRequest.findMany({
    include: {
      client:      { select: { customerName: true, code: true } },
      reportedBy:  { select: { name: true } },
      evaluatedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const returnItems: ReturnItem[] = raw.map((r) => ({
    id:              r.id,
    returnNumber:    r.returnNumber,
    serialNumber:    r.serialNumber,
    reportedIssue:   r.reportedIssue,
    status:          r.status,
    type:            r.type,
    resolution:      r.resolution,
    faultType:       r.faultType,
    faultApproval:   r.faultApproval,
    clientName:      r.client.customerName,
    clientCode:      r.client.code,
    createdByName:   r.reportedBy.name,
    evaluatedByName: r.evaluatedBy?.name ?? null,
    createdAt:       r.createdAt.toISOString(),
    batchId:         r.batchId,
    origin:          'replacement',
  }));

  // Fetch standalone rework records (QC failures not linked to returns)
  const standaloneRework = await prisma.reworkRecord.findMany({
    where: { returnRequestId: null },
    include: {
      unit: {
        select: {
          id: true,
          serialNumber: true,
          currentStage: true,
          currentStatus: true,
          order: { select: { id: true, orderNumber: true, product: { select: { name: true, code: true } } } },
        },
      },
      assignedUser: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  const qcFailItems: QCFailItem[] = standaloneRework.map((r) => ({
    id:           r.id,
    unitId:       r.unit.id,
    unitSerial:   r.unit.serialNumber,
    orderNumber:  r.unit.order?.orderNumber ?? '—',
    productName:  r.unit.order?.product?.name ?? '—',
    status:       r.status,
    cycleCount:   r.cycleCount,
    assignedTo:   r.assignedUser?.name ?? null,
    createdAt:    r.createdAt.toISOString(),
    origin:       'qc_failure',
  }));

  // Build tab counts
  const pendingReturns  = returnItems.filter(i => RETURN_PENDING.includes(i.status));
  const activeReturns   = returnItems.filter(i => RETURN_ACTIVE.includes(i.status));
  const doneReturns     = returnItems.filter(i => RETURN_DONE.includes(i.status));

  const activeRework    = qcFailItems.filter(i => REWORK_ACTIVE.includes(i.status));
  const doneRework      = qcFailItems.filter(i => REWORK_DONE.includes(i.status));

  const pendingCount    = pendingReturns.length;
  const activeCount     = activeReturns.length + activeRework.length;
  const doneCount       = doneReturns.length + doneRework.length;

  let activeItems: UnifiedItem[] = [];
  if (tab === 'pending') {
    activeItems = pendingReturns;
  } else if (tab === 'active') {
    activeItems = [...activeReturns, ...activeRework].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } else {
    activeItems = [...doneReturns, ...doneRework].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  const TABS = [
    { key: 'pending',   label: 'Pending',   count: pendingCount,  accent: '#fbbf24' },
    { key: 'active',    label: 'In Repair',  count: activeCount,   accent: '#f97316' },
    { key: 'completed', label: 'Completed',  count: doneCount,     accent: '#71717a' },
  ];

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Rework</h2>
          <p className="text-xs text-slate-500 mt-0.5">Replacement requests and QC failures</p>
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
      {activeItems.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="flex justify-center mb-3"><Package className="w-4 h-4 text-zinc-600" /></div>
          <p className="text-slate-400 text-sm">
            {tab === 'pending'   ? 'No pending requests.' :
             tab === 'active'    ? 'Nothing currently in repair.' :
             'No completed items yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeItems.map(item =>
            item.origin === 'replacement'
              ? <ReturnCard key={item.id} item={item} />
              : <QCFailCard key={item.id} item={item} />
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
              <OriginBadge origin="replacement" />
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
                <Package className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span className="text-xs font-mono text-sky-300">{item.serialNumber}</span>
              </div>
            )}

            {item.faultType && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={item.faultType === 'MANUFACTURING_DEFECT'
                    ? { background: 'rgba(239,68,68,0.12)', color: '#f87171' }
                    : { background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                  {item.faultType === 'MANUFACTURING_DEFECT' ? 'Mfg Defect' : 'Customer Damage'}
                </span>
                {item.faultApproval === 'PENDING' && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                    Awaiting Approval
                  </span>
                )}
              </div>
            )}

            <div className="p-2 rounded-lg mb-2" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-[9px] font-semibold text-amber-500 uppercase tracking-wider mb-0.5">Reported Issue</p>
              <p className="text-xs text-amber-200 line-clamp-2">{item.reportedIssue}</p>
            </div>

            <p className="text-[10px] text-slate-600">Logged by {item.createdByName}</p>
          </div>
          <svg className="text-zinc-600 shrink-0 mt-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        </div>
      </div>
    </Link>
  );
}

function QCFailCard({ item }: { item: QCFailItem }) {
  const date = new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

  return (
    <Link href={`/units/${item.unitId}`} className="block">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <OriginBadge origin="qc_failure" />
              <StatusBadge status={item.status} />
              {item.cycleCount > 1 && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>
                  Cycle {item.cycleCount}
                </span>
              )}
              <span className="text-[10px] text-slate-600">{date}</span>
            </div>

            <div className="flex items-center gap-2 mb-2 p-2 rounded-lg" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}>
              <Wrench className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-xs font-mono text-sky-300">{item.unitSerial}</span>
            </div>

            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-zinc-400">{item.productName}</span>
              <span className="text-[10px] text-zinc-600 font-mono">{item.orderNumber}</span>
            </div>

            {item.assignedTo && (
              <p className="text-[10px] text-slate-600">Assigned to {item.assignedTo}</p>
            )}
          </div>
          <svg className="text-zinc-600 shrink-0 mt-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
        </div>
      </div>
    </Link>
  );
}
