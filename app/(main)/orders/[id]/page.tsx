import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { OrderDetail, type StageGroup } from './OrderDetail';
import { OrderNotes } from './OrderNotes';

const STAGE_CONFIG: { key: string; label: string }[] = [
  { key: 'POWERSTAGE_MANUFACTURING', label: 'Powerstage' },
  { key: 'BRAINBOARD_MANUFACTURING', label: 'Brainboard' },
  { key: 'CONTROLLER_ASSEMBLY',      label: 'Assembly' },
  { key: 'QC_AND_SOFTWARE',          label: 'QC & Software' },
  { key: 'FINAL_ASSEMBLY',           label: 'Final Assembly' },
  { key: 'REWORK',                   label: 'Rework' },
];

// Ordered pipeline (REWORK is a side-branch, not in the main sequence)
const STAGE_PIPELINE = [
  'POWERSTAGE_MANUFACTURING',
  'BRAINBOARD_MANUFACTURING',
  'CONTROLLER_ASSEMBLY',
  'QC_AND_SOFTWARE',
  'FINAL_ASSEMBLY',
];

// Which DB barcode field corresponds to each stage
const STAGE_BARCODE_FIELD: Record<string, 'powerstageBarcode' | 'brainboardBarcode' | 'assemblyBarcode' | 'qcBarcode' | 'finalAssemblyBarcode' | null> = {
  POWERSTAGE_MANUFACTURING: 'powerstageBarcode',
  BRAINBOARD_MANUFACTURING: 'brainboardBarcode',
  CONTROLLER_ASSEMBLY:      'assemblyBarcode',
  QC_AND_SOFTWARE:          'qcBarcode',
  FINAL_ASSEMBLY:           'finalAssemblyBarcode',
  REWORK:                   null,
};

type UnitRow = {
  id: string;
  serialNumber: string;
  currentStage: string;
  currentStatus: string;
  readyForDispatch: boolean;
  powerstageBarcode: string | null;
  brainboardBarcode: string | null;
  assemblyBarcode: string | null;
  qcBarcode: string | null;
  finalAssemblyBarcode: string | null;
};

/**
 * Derive what status a unit has AT a given stage — even if it has already moved past it.
 *   COMPLETED  → unit has passed through this stage
 *   <actual>   → unit is currently at this stage (IN_PROGRESS / PENDING / etc.)
 *   PENDING    → unit hasn't reached this stage yet
 *   BLOCKED    → unit is in REWORK (blocked from all normal stages)
 */
function derivedStageStatus(unit: UnitRow, stageKey: string): string {
  if (unit.currentStage === 'REWORK') {
    return stageKey === 'REWORK' ? unit.currentStatus : 'BLOCKED';
  }
  if (stageKey === 'REWORK') return 'PENDING';

  const curIdx = STAGE_PIPELINE.indexOf(unit.currentStage);
  const tarIdx = STAGE_PIPELINE.indexOf(stageKey);

  if (curIdx < 0 || tarIdx < 0) return unit.currentStatus;
  if (tarIdx < curIdx) return 'COMPLETED';          // already passed this stage
  if (tarIdx === curIdx) return unit.currentStatus;  // currently here
  return 'PENDING';                                  // not yet reached
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'ACCOUNTS') redirect('/accounts');
  if (session.role === 'QC_USER') redirect('/qc');

  const { id } = await params;
  const isEmployee = session.role === 'PRODUCTION_EMPLOYEE';

  const [order, jobCards] = await Promise.all([
  prisma.order.findUnique({
    where: { id },
    include: {
      product: true,
      units: {
        select: {
          id: true,
          serialNumber: true,
          currentStage: true,
          currentStatus: true,
          powerstageBarcode: true,
          brainboardBarcode: true,
          assemblyBarcode: true,
          qcBarcode: true,
          finalAssemblyBarcode: true,
          readyForDispatch: true,
          dispatchedAt: true,
        },
        orderBy: { serialNumber: 'asc' },
      },
      dispatchOrders: {
        where:   { status: 'APPROVED' },
        select: {
          id:          true,
          doNumber:    true,
          dispatchQty: true,
          approvedAt:  true,
          invoices: {
            select: { id: true, invoiceNumber: true, subType: true, totalAmount: true, currency: true, notes: true },
          },
        },
        orderBy: { approvedAt: 'asc' },
      },
    },
  }),
  prisma.jobCard.findMany({
    where: { orderId: id },
    include: {
      createdBy:    { select: { name: true } },
      dispatchedBy: { select: { name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: 'asc' },
  }),
  ]);
  if (!order) notFound();

  // Fetch notes (available to SALES, PM, ADMIN, ACCOUNTS)
  const canViewNotes = ['ADMIN', 'SALES', 'ACCOUNTS'].includes(session.role);
  const notes = canViewNotes
    ? await prisma.orderNote.findMany({
        where: { orderId: id },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      })
    : [];

  // ── SALES: simplified order status view (no production tools) ──────────────
  if (session.role === 'SALES') {
    const total     = order.units.length;
    const dispatched = order.units.filter((u) => u.dispatchedAt).length;
    const ready     = order.units.filter((u) => u.readyForDispatch && !u.dispatchedAt).length;
    const inFinal   = order.units.filter((u) => u.currentStage === 'FINAL_ASSEMBLY' && !u.readyForDispatch && !u.dispatchedAt).length;
    const inQC      = order.units.filter((u) => u.currentStage === 'QC_AND_SOFTWARE').length;
    const inRework  = order.units.filter((u) => u.currentStage === 'REWORK').length;
    const inMfg     = order.units.filter((u) =>
      !['QC_AND_SOFTWARE','FINAL_ASSEMBLY','REWORK'].includes(u.currentStage) &&
      u.currentStatus !== 'PENDING' && !u.readyForDispatch && !u.dispatchedAt
    ).length;
    const notStarted = order.units.filter((u) =>
      u.currentStage === 'POWERSTAGE_MANUFACTURING' && u.currentStatus === 'PENDING'
    ).length;
    const blocked   = order.units.filter((u) => u.currentStatus === 'BLOCKED').length;
    const done      = ready + dispatched;
    const pct       = total > 0 ? Math.round((done / total) * 100) : 0;

    const holdReason = (order as any).holdReason as string | null;

    return (
      <div className="space-y-5">
        {/* Back to Status tab */}
        <Link href="/sales?tab=status"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Order Status
        </Link>

        {/* Summary card */}
        <div className="card p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-mono font-bold text-lg text-white">{order.orderNumber}</h2>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={order.status === 'ACTIVE'
                    ? { background: 'rgba(34,197,94,0.1)', color: '#4ade80' }
                    : order.status === 'HOLD'
                    ? { background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }
                    : { background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>
                  {order.status}
                </span>
              </div>
              <p className="text-zinc-400 text-sm mt-0.5">{order.product.name}</p>
              <p className="text-zinc-600 text-xs mt-0.5">
                {total} unit{total !== 1 ? 's' : ''}
                {order.dueDate
                  ? ` · ETA ${new Date(order.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : ''}
              </p>
            </div>
            <div className="shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-lg font-bold leading-none" style={{ color: pct === 100 ? '#4ade80' : 'white' }}>{pct}%</span>
              <span className="text-[9px] text-zinc-500 mt-0.5">done</span>
            </div>
          </div>

          {/* Hold reason */}
          {order.status === 'HOLD' && holdReason && (
            <div className="px-3 py-2 rounded-lg text-xs"
              style={{ background: 'rgba(251,191,36,0.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
              ⏸ On hold: {holdReason}
            </div>
          )}

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: pct === 100 ? '#4ade80' : 'linear-gradient(90deg,#818cf8,#38bdf8,#4ade80)' }} />
          </div>

          {/* Stage badges */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {notStarted > 0 && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(113,113,122,0.12)', color: '#a1a1aa', border: '1px solid rgba(113,113,122,0.2)' }}>Queue: {notStarted}</span>}
            {inMfg > 0     && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(129,140,248,0.12)', color: '#818cf8', border: '1px solid rgba(129,140,248,0.25)' }}>Manufacturing: {inMfg}</span>}
            {inQC > 0      && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>In QC: {inQC}</span>}
            {inFinal > 0   && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>Final Assy: {inFinal}</span>}
            {inRework > 0  && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(249,115,22,0.12)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.3)' }}>⚠ Rework: {inRework}</span>}
            {blocked > 0   && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>🚫 Blocked: {blocked}</span>}
            {ready > 0     && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>✓ Ready: {ready}</span>}
            {dispatched > 0 && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.25)' }}>✈ Dispatched: {dispatched}</span>}
          </div>
        </div>

        {/* Invoices */}
        {order.dispatchOrders.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Invoices</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>
            {order.dispatchOrders.map((d) => {
              const tracking = d.invoices
                .map((inv) => {
                  const line = (inv.notes ?? '').split('\n').find((l) => l.startsWith('Tracking:'));
                  return line ? line.replace('Tracking:', '').trim() : '';
                })
                .find((t) => t) ?? '';
              const isPartial = d.dispatchQty < order.units.length;
              return (
                <div key={d.id} className="card p-3 space-y-2">
                  {/* DO header */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-sky-400">{d.doNumber}</span>
                    {isPartial && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
                        Partial
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500">
                      ✈ {d.dispatchQty} unit{d.dispatchQty !== 1 ? 's' : ''}
                      {d.approvedAt
                        ? ` · ${new Date(d.approvedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
                        : ''}
                    </span>
                    {tracking ? (
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
                        🚚 {tracking}
                      </span>
                    ) : (
                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(251,191,36,0.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
                        ⏳ No tracking yet
                      </span>
                    )}
                  </div>
                  {/* Invoice download links */}
                  <div className="flex flex-wrap gap-2">
                    {d.invoices.map((inv) => (
                      <a
                        key={inv.id}
                        href={`/print/invoice/${inv.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                        style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}
                      >
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V8m0 8l-3-3m3 3l3-3M4 20h16" />
                        </svg>
                        {inv.invoiceNumber}
                        {inv.subType !== 'FULL' && (
                          <span className="text-[9px] opacity-70">({inv.subType === 'GOODS' ? 'Goods' : 'Service'})</span>
                        )}
                        {inv.totalAmount > 0 && (
                          <span className="text-[9px] opacity-60">
                            {inv.currency} {inv.totalAmount.toLocaleString('en-IN')}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Notes */}
        <OrderNotes
          orderId={order.id}
          currentRole={session.role}
          initialNotes={notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
        />
      </div>
    );
  }

  /**
   * Each stage shows ALL units with colour-coded status:
   *   Grey    → not started at this stage (PENDING)
   *   Yellow  → in progress (IN_PROGRESS)
   *   Green   → passed / completed (COMPLETED / APPROVED)
   *   Red     → failed / blocked (BLOCKED / REJECTED_BACK)
   *
   * REWORK stage is the only exception: shows only units currently in rework.
   */
  const stages: StageGroup[] = STAGE_CONFIG.map(({ key, label }) => {
    const unitsForStage =
      key === 'REWORK'
        ? order.units.filter((u) => u.currentStage === 'REWORK')
        : order.units;

    return {
      key,
      label,
      units: unitsForStage.map((u) => {
        const field = STAGE_BARCODE_FIELD[key];
        // For FA, only show the barcode if the unit has actually reached or completed FA
        const unitAtOrPastStage =
          key !== 'FINAL_ASSEMBLY' ||
          STAGE_PIPELINE.indexOf(u.currentStage) >= STAGE_PIPELINE.indexOf('FINAL_ASSEMBLY');
        return {
          id: u.id,
          serialNumber: u.serialNumber,
          currentStage: u.currentStage,
          currentStatus: u.currentStatus,
          readyForDispatch: u.readyForDispatch,
          barcodeForStage: field && unitAtOrPastStage ? (u[field] ?? null) : null,
          derivedStatus: derivedStageStatus(u, key),
          // Pass PS + BB barcodes for Assembly multi-select modal
          powerstageBarcode: key === 'CONTROLLER_ASSEMBLY' ? (u.powerstageBarcode ?? null) : undefined,
          brainboardBarcode: key === 'CONTROLLER_ASSEMBLY' ? (u.brainboardBarcode ?? null) : undefined,
        };
      }),
    };
  });

  const total      = order.units.length;
  const completed  = order.units.filter((u) => u.currentStatus === 'COMPLETED' || u.currentStatus === 'APPROVED' || u.readyForDispatch).length;
  const inProgress = order.units.filter((u) => u.currentStatus === 'IN_PROGRESS').length;
  const blocked    = order.units.filter((u) => u.currentStatus === 'BLOCKED').length;
  const pct        = total > 0 ? Math.round((completed / total) * 100) : 0;

  const isNew = Date.now() - order.createdAt.getTime() < 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Orders
      </Link>

      {/* Order header card */}
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-mono font-bold text-lg">{order.orderNumber}</h2>
            {isNew && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(56,189,248,0.2)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}
              >
                NEW
              </span>
            )}
          </div>
          <span
            className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
              order.status === 'ACTIVE' ? 'text-green-400' : 'text-zinc-500'
            }`}
            style={
              order.status === 'ACTIVE'
                ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
            }
          >
            {order.status}
          </span>
        </div>

        <p className="text-zinc-400 text-sm">
          {order.product.name}
          {order.voltage ? ` · ${order.voltage}` : ''}
        </p>

        {order.dueDate && (
          <p className="text-zinc-600 text-xs mt-1">
            ETA: {new Date(order.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
        {order.status === 'HOLD' && (order as any).holdReason && (
          <div className="mt-2 px-3 py-2 rounded-lg text-xs"
            style={{ background: 'rgba(251,191,36,0.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
            ⏸ On hold: {(order as any).holdReason}
          </div>
        )}

        {/* Progress summary */}
        <div className="mt-4">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center">
              <p className="text-xl font-bold text-white">{total}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Total</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-green-400">{completed}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Done</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-amber-400">{inProgress}</p>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide">Active</p>
            </div>
          </div>
          {blocked > 0 && (
            <p className="text-xs text-red-400 text-center mb-2">⚠ {blocked} unit{blocked !== 1 ? 's' : ''} blocked</p>
          )}
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background:
                  pct === 100
                    ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                    : pct > 50
                    ? 'linear-gradient(90deg,#38bdf8,#0ea5e9)'
                    : 'linear-gradient(90deg,#6366f1,#38bdf8)',
              }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-zinc-600 mt-1">
            <span>Order progress</span>
            <span className={pct === 100 ? 'text-green-400 font-semibold' : ''}>{pct}%</span>
          </div>
        </div>
      </div>

      {/* Employee instruction */}
      {isEmployee && (
        <div
          className="rounded-xl p-3 flex items-start gap-3"
          style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}
        >
          <svg className="text-sky-400 shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><path d="M14 14h.01M18 14h.01M14 18h.01M18 18h.01M21 14v4M14 21h4" />
          </svg>
          <div>
            <p className="text-sky-400 text-xs font-semibold">Scan to start working</p>
            <p className="text-zinc-500 text-xs mt-0.5">
              Pick up a physical unit, scan its barcode below to reveal it, then tap it to open your work page.
            </p>
          </div>
        </div>
      )}

      {/* Job Cards */}
      {jobCards.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Job Cards</h3>
          <div className="space-y-2">
            {jobCards.map((jc) => {
              const statusBg: Record<string, string> = {
                PENDING:   'rgba(251,191,36,0.12)',
                ISSUED:    'rgba(56,189,248,0.10)',
                ACTIVE:    'rgba(34,197,94,0.10)',
                COMPLETED: 'rgba(255,255,255,0.04)',
                CANCELLED: 'rgba(239,68,68,0.08)',
              };
              const statusColor: Record<string, string> = {
                PENDING:   '#fbbf24',
                ISSUED:    '#38bdf8',
                ACTIVE:    '#4ade80',
                COMPLETED: '#6b7280',
                CANCELLED: '#f87171',
              };
              const stageLabel: Record<string, string> = {
                POWERSTAGE_MANUFACTURING: 'Powerstage',
                BRAINBOARD_MANUFACTURING: 'Brainboard',
                CONTROLLER_ASSEMBLY:      'Assembly',
                QC_AND_SOFTWARE:          'QC & Software',
                REWORK:                   'Rework',
                FINAL_ASSEMBLY:           'Final Assembly',
              };
              return (
                <div key={jc.id}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: statusBg[jc.status] ?? 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-sm font-semibold text-white shrink-0">{jc.cardNumber}</span>
                    <span className="text-zinc-500 text-xs shrink-0">{stageLabel[jc.stage] ?? jc.stage}</span>
                    <span className="text-zinc-600 text-xs">{jc._count.items} items</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.06)', color: statusColor[jc.status] ?? '#9ca3af' }}>
                      {jc.status}
                    </span>
                    <a href={`/print/job-card/${jc.id}`} target="_blank" rel="noreferrer"
                      className="text-zinc-500 hover:text-white text-sm px-2 py-1 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors"
                      title="Print Job Card">🖨</a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stage breakdown */}
      <OrderDetail orderId={order.id} stages={stages} isEmployee={isEmployee} role={session.role} totalUnits={total} />

      {/* Notes thread — visible to SALES, PM, ADMIN, ACCOUNTS */}
      {canViewNotes && (
        <OrderNotes
          orderId={order.id}
          currentRole={session.role}
          initialNotes={notes.map((n) => ({
            ...n,
            createdAt: n.createdAt.toISOString(),
          }))}
        />
      )}
    </div>
  );
}
