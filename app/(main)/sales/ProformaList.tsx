'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { useState } from 'react';
import { AlertTriangle, Check, X, Plane, Truck } from 'lucide-react';

type OrderUnit = {
  currentStage:     string;
  currentStatus:    string;
  readyForDispatch: boolean;
  dispatchedAt:     string | null;
};

type OrderDO = {
  id:          string;
  doNumber:    string;
  dispatchQty: number;
  approvedAt:  string | null;
  invoices:    Array<{ id: string; invoiceNumber: string; notes: string | null }>;
};

type ProformaRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceType: string;
  currency: string;
  status: string;
  deliveryDays: number | null;
  client: { id: string; code: string; customerName: string; globalOrIndian: string | null };
  createdBy: { id: string; name: string };
  _count: { items: number };
  order: {
    id: string;
    orderNumber: string;
    status: string;
    holdReason: string | null;
    quantity: number;
    dueDate: string | null;
    _count: { notes: number };
    units: OrderUnit[];
    dispatchOrders: OrderDO[];
  } | null;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  subType: string;
  currency: string;
  totalAmount: number;
  createdAt: string;
  notes: string | null;
  client: { id: string; code: string; customerName: string; globalOrIndian: string | null };
  dispatchOrder: { doNumber: string; approvedAt: string | null; order: { orderNumber: string } | null } | null;
  _count: { items: number };
};

type ReturnRequestRow = {
  id: string;
  returnNumber: string;
  type: string;
  status: string;
  reportedIssue: string;
  serialNumber?: string | null;
  createdAt: string;
  client: { code: string; customerName: string };
  reportedBy: { name: string };
};

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  DRAFT:            { bg: 'rgba(113,113,122,0.1)', color: '#a1a1aa', border: 'rgba(113,113,122,0.2)' },
  PENDING_APPROVAL: { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  APPROVED:         { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80', border: 'rgba(34,197,94,0.2)'  },
  REJECTED:         { bg: 'rgba(239,68,68,0.1)',   color: '#f87171', border: 'rgba(239,68,68,0.2)'  },
  CONVERTED:        { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
};

const SUBTYPE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  FULL:    { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8', label: 'Full'    },
  GOODS:   { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80', label: 'Goods'   },
  SERVICE: { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24', label: 'Service' },
};

const RETURN_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  REPORTED:      { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24' },
  EVALUATED:     { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8' },
  APPROVED:      { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80' },
  UNIT_RECEIVED: { bg: 'rgba(14,165,233,0.1)',  color: '#0ea5e9' },
  IN_REPAIR:     { bg: 'rgba(249,115,22,0.1)',  color: '#fb923c' },
  REPAIRED:      { bg: 'rgba(52,211,153,0.1)',  color: '#34d399' },
  DISPATCHED:    { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80' },
  REJECTED:      { bg: 'rgba(239,68,68,0.1)',   color: '#f87171' },
  CLOSED:        { bg: 'rgba(113,113,122,0.1)', color: '#a1a1aa' },
};

const RETURN_TYPE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  WARRANTY:   { bg: 'rgba(139,92,246,0.1)', color: '#a78bfa', label: 'Warranty'   },
  DAMAGE:     { bg: 'rgba(239,68,68,0.1)',  color: '#f87171', label: 'Damage'     },
  WRONG_ITEM: { bg: 'rgba(245,158,11,0.1)', color: '#fbbf24', label: 'Wrong Item' },
  OTHER:      { bg: 'rgba(113,113,122,0.1)',color: '#a1a1aa', label: 'Other'      },
};

type TabKey = 'pi' | 'invoice' | 'returns' | 'status';

const ORDER_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  ACTIVE:     { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80' },
  HOLD:       { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24' },
  CANCELLED:  { bg: 'rgba(239,68,68,0.1)',   color: '#f87171' },
  CLOSED:     { bg: 'rgba(113,113,122,0.1)', color: '#a1a1aa' },
  DISPATCHED: { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8' },
};

const PROD_STAGES: Array<{ key: string; label: string; color: string }> = [
  { key: 'POWERSTAGE_MANUFACTURING', label: 'Powerstage', color: '#818cf8' },
  { key: 'BRAINBOARD_MANUFACTURING', label: 'Brainboard',  color: '#a78bfa' },
  { key: 'CONTROLLER_ASSEMBLY',      label: 'Assembly',    color: '#38bdf8' },
  { key: 'QC_AND_SOFTWARE',          label: 'QC',          color: '#f59e0b' },
  { key: 'FINAL_ASSEMBLY',           label: 'Final Assy',  color: '#34d399' },
];

function analyseUnits(units: OrderUnit[]) {
  let notStarted   = 0; // in PS stage, still PENDING
  let inProduction = 0; // PS/BB/CA actively being worked on
  let inQC         = 0; // at QC_AND_SOFTWARE
  let passedQC     = 0; // at FINAL_ASSEMBLY (not yet ready/dispatched)
  let rework       = 0; // in REWORK stage
  let blocked      = 0; // any BLOCKED status
  let ready        = 0; // readyForDispatch = true
  let dispatched   = 0; // dispatchedAt set

  for (const u of units) {
    if (u.currentStatus === 'BLOCKED') { blocked++; continue; }
    if (u.dispatchedAt)                 { dispatched++;  continue; }
    if (u.readyForDispatch)             { ready++;       continue; }
    if (u.currentStage === 'REWORK')    { rework++;      continue; }

    if (u.currentStage === 'FINAL_ASSEMBLY')           { passedQC++;     continue; }
    if (u.currentStage === 'QC_AND_SOFTWARE')          { inQC++;         continue; }
    if (u.currentStatus === 'PENDING' &&
        u.currentStage  === 'POWERSTAGE_MANUFACTURING') { notStarted++;  continue; }
    inProduction++;
  }
  return { notStarted, inProduction, inQC, passedQC, rework, blocked, ready, dispatched };
}

function getPhaseLabel(a: ReturnType<typeof analyseUnits>, total: number): { text: string; color: string } {
  const done = a.ready + a.dispatched;
  if (a.notStarted === total)               return { text: 'In queue — manufacturing not yet started', color: '#a1a1aa' };
  if (done === total)                        return { text: 'All units dispatched', color: '#38bdf8' };
  if (a.dispatched > 0 && done < total)     return { text: `Partially dispatched — ${total - done} unit${total - done !== 1 ? 's' : ''} remaining`, color: '#fbbf24' };
  if (a.ready > 0)                          return { text: `${a.ready} unit${a.ready !== 1 ? 's' : ''} ready for dispatch`, color: '#4ade80' };
  if (a.passedQC > 0)                       return { text: `${a.passedQC} unit${a.passedQC !== 1 ? 's' : ''} in final assembly — ${total - a.passedQC - a.dispatched - a.ready} QC/earlier`, color: '#34d399' };
  if (a.inQC > 0)                           return { text: `${a.inQC} unit${a.inQC !== 1 ? 's' : ''} in QC — ${a.inProduction} in manufacturing`, color: '#f59e0b' };
  return { text: 'Manufacturing in progress', color: '#818cf8' };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Grouping helpers ─────────────────────────────────────────────────────────
type DOGroup = {
  key: string;
  doNumber: string | null;
  orderNumber: string | null;
  clientName: string;
  invoices: InvoiceRow[];
};
type MonthGroup = {
  key: string;   // e.g. "2026-03"
  label: string; // e.g. "March 2026"
  count: number;
  doGroups: DOGroup[];
};

// Group by DO only (no month wrapper — used for Current tab)
function buildDOGroups(invoices: InvoiceRow[]): DOGroup[] {
  const groups: DOGroup[] = [];
  const seen = new Map<string, number>();
  for (const inv of invoices) {
    const key = inv.dispatchOrder?.doNumber ?? `no-do-${inv.id}`;
    if (!seen.has(key)) {
      seen.set(key, groups.length);
      groups.push({
        key,
        doNumber:    inv.dispatchOrder?.doNumber ?? null,
        orderNumber: inv.dispatchOrder?.order?.orderNumber ?? null,
        clientName:  inv.client.customerName,
        invoices:    [],
      });
    }
    groups[seen.get(key)!].invoices.push(inv);
  }
  return groups;
}

function buildMonthGroups(invoices: InvoiceRow[]): MonthGroup[] {
  const months: MonthGroup[] = [];
  const seenMonths = new Map<string, number>();
  const seenDOs    = new Map<string, { mi: number; di: number }>();

  for (const inv of invoices) {
    const date      = new Date(inv.dispatchOrder?.approvedAt ?? inv.createdAt);
    const monthKey  = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    if (!seenMonths.has(monthKey)) {
      seenMonths.set(monthKey, months.length);
      months.push({ key: monthKey, label: monthLabel, count: 0, doGroups: [] });
    }
    const mi = seenMonths.get(monthKey)!;
    months[mi].count++;

    const doKey = `${monthKey}||${inv.dispatchOrder?.doNumber ?? `no-do-${inv.id}`}`;
    if (!seenDOs.has(doKey)) {
      seenDOs.set(doKey, { mi, di: months[mi].doGroups.length });
      months[mi].doGroups.push({
        key: doKey,
        doNumber:    inv.dispatchOrder?.doNumber ?? null,
        orderNumber: inv.dispatchOrder?.order?.orderNumber ?? null,
        clientName:  inv.client.customerName,
        invoices:    [],
      });
    }
    const { mi: mi2, di } = seenDOs.get(doKey)!;
    months[mi2].doGroups[di].invoices.push(inv);
  }
  return months;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function parseTracking(notes: string | null): string {
  if (!notes) return '';
  const line = notes.split('\n').find((l) => l.startsWith('Tracking:'));
  return line ? line.replace('Tracking:', '').trim() : '';
}

function buildUpdatedNotes(notes: string | null, tracking: string): string {
  const lines = (notes ?? '').split('\n').filter((l) => !l.startsWith('Tracking:'));
  if (tracking.trim()) lines.push(`Tracking: ${tracking.trim()}`);
  return lines.join('\n').trim();
}

// ── Reusable DO folder component ─────────────────────────────────────────────
function InvoiceDOFolder({
  grp,
  isOpen,
  onToggle,
  showTracking = false,
  canEditTracking = true,
  onTrackingSaved,
}: {
  grp: DOGroup;
  isOpen: boolean;
  onToggle: () => void;
  showTracking?: boolean;
  canEditTracking?: boolean;
  onTrackingSaved?: () => void;
}) {
  // Derive tracking from first invoice that has it, or empty
  const initialTracking = grp.invoices.map((inv) => parseTracking(inv.notes)).find((t) => t) ?? '';

  // localTracking mirrors DB after save without needing a page reload
  const [localTracking, setLocalTracking] = useState(initialTracking);
  const [trackingInput, setTrackingInput] = useState(initialTracking);
  const [editing, setEditing]             = useState(false);
  const [saving, setSaving]               = useState(false);

  const hasTracking = !!localTracking;

  const saveTracking = useCallback(async () => {
    if (!trackingInput.trim()) return;
    setSaving(true);
    try {
      await Promise.all(
        grp.invoices.map((inv) =>
          fetch(`/api/invoices/${inv.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: buildUpdatedNotes(inv.notes, trackingInput) }),
          })
        )
      );
      setLocalTracking(trackingInput.trim());
      setEditing(false);
      onTrackingSaved?.();
    } finally {
      setSaving(false);
    }
  }, [grp.invoices, trackingInput, onTrackingSaved]);

  return (
    <div className="card overflow-hidden">
      {/* ── Folder header ── */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          className="shrink-0 text-amber-400"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-amber-400">
          <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {grp.doNumber
              ? <span className="font-mono font-semibold text-xs text-white">{grp.doNumber}</span>
              : <span className="text-xs text-zinc-500">No DO</span>
            }
            {grp.orderNumber && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">#{grp.orderNumber}</span>
            )}
            <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">
              {grp.invoices.length} invoice{grp.invoices.length !== 1 ? 's' : ''}
            </span>
            {/* Tracking badge — only in Current tab */}
            {showTracking && (
              hasTracking
                ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1"
                    style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
                    <Check className="w-4 h-4" /> {localTracking}
                  </span>
                : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded animate-pulse"
                    style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                    <AlertTriangle className="w-3 h-3 mr-1 inline" /> No tracking
                  </span>
            )}
          </div>
          <p className="text-zinc-500 text-[10px] mt-0.5 truncate">{grp.clientName}</p>
        </div>
      </button>

      {/* ── Tracking input row (Current tab only, editable for non-SALES) ── */}
      {showTracking && canEditTracking && !hasTracking && !editing && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-t"
          style={{ borderColor: 'rgba(251,191,36,0.15)', background: 'rgba(251,191,36,0.04)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-[10px] text-amber-400 flex-1">Add tracking number for this shipment</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors"
            style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
          >
            + Add
          </button>
        </div>
      )}

      {showTracking && canEditTracking && editing && (
        <div
          className="flex items-center gap-2 px-3 py-2 border-t"
          style={{ borderColor: 'rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.04)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
            placeholder="e.g. DHL1234567890"
            value={trackingInput}
            onChange={(e) => setTrackingInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveTracking(); if (e.key === 'Escape') setEditing(false); }}
          />
          <button
            type="button"
            onClick={saveTracking}
            disabled={saving || !trackingInput.trim()}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40"
            style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
          >
            {saving ? '…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setTrackingInput(localTracking); }}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Invoices inside DO ── */}
      {isOpen && (
        <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          {grp.invoices.map((inv, idx) => {
            const st = SUBTYPE_STYLE[inv.subType] ?? SUBTYPE_STYLE.FULL;
            return (
              <div
                key={inv.id}
                className="flex items-center gap-2.5 pl-8 pr-3 py-2"
                style={idx < grp.invoices.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}
              >
                <div className="w-px h-4 shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} />
                <a
                  href={`/print/invoice/${inv.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap"
                >
                  <span className="font-mono text-xs text-sky-400 hover:text-sky-300 hover:underline">{inv.invoiceNumber}</span>
                  <span
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded border"
                    style={{ background: st.bg, color: st.color, borderColor: st.color + '44' }}
                  >
                    {st.label}
                  </span>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500">{inv.currency}</span>
                  {inv.totalAmount > 0 && (
                    <span className="text-[10px] text-zinc-500">
                      {inv.currency} {inv.totalAmount.toLocaleString('en-IN')}
                    </span>
                  )}
                </a>
                <a
                  href={`/print/invoice/${inv.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View / Download PDF"
                  className="shrink-0 flex items-center justify-center w-6 h-6 rounded-lg text-zinc-600 hover:text-sky-400 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V8m0 8l-3-3m3 3l3-3M4 20h16" />
                  </svg>
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Processing order card ─────────────────────────────────────────────────────
function OrderStatusCard({ p, role }: { p: ProformaRow; role: string }) {
  const order = p.order!;
  const total = order.units.length;
  const a     = analyseUnits(order.units);
  const done  = a.ready + a.dispatched;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const os    = ORDER_STATUS_STYLE[order.status] ?? ORDER_STATUS_STYLE.ACTIVE;
  const phase = getPhaseLabel(a, total);

  // ETA: prefer PM's dueDate on order, fall back to PI invoiceDate + deliveryDays
  const etaDate = order.dueDate
    ? new Date(order.dueDate)
    : p.deliveryDays
    ? new Date(new Date(p.invoiceDate).getTime() + p.deliveryDays * 86_400_000)
    : null;
  const dueDate   = etaDate;
  const dueMsLeft = dueDate ? dueDate.getTime() - Date.now() : null;
  const dueColor  = dueMsLeft === null ? null
    : dueMsLeft < 0             ? '#f87171'
    : dueMsLeft < 7 * 86400_000 ? '#fbbf24'
    : '#4ade80';

  return (
    <div className="card overflow-hidden group">
      {/* Header */}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-zinc-500">{p.invoiceNumber}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-zinc-600 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <Link href={`/orders/${order.id}`}
                className="font-mono text-sm font-bold text-sky-400 hover:text-sky-300 hover:underline">
                #{order.orderNumber}
              </Link>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: os.bg, color: os.color }}>
                {order.status}
              </span>
            </div>
            <p className="text-zinc-200 text-sm mt-0.5 font-medium">{p.client.customerName}</p>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span className="text-zinc-600 text-xs">{order.quantity} unit{order.quantity !== 1 ? 's' : ''}</span>
              {dueDate && (
                <span className="text-xs font-medium" style={{ color: dueColor ?? '#a1a1aa' }}>
                  {dueMsLeft! < 0 ? <><AlertTriangle className="w-4 h-4 mr-1 inline" />Overdue · </> : 'Due '}
                  {fmtDate(dueDate.toISOString())}
                  {p.deliveryDays ? ` (${p.deliveryDays}d)` : ''}
                </span>
              )}
              {role !== 'SALES' && <span className="text-zinc-600 text-xs">· {p.createdBy.name}</span>}
            </div>
            {/* Hold reason */}
            {order.status === 'HOLD' && order.holdReason && (
              <p className="text-xs mt-1 px-2 py-1 rounded-lg"
                style={{ background: 'rgba(251,191,36,0.08)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
                ⏸ On hold: {order.holdReason}
              </p>
            )}
          </div>
          {/* Progress % + notes */}
          <div className="shrink-0 flex flex-col items-center gap-1.5">
            <div className="flex flex-col items-center justify-center w-12 h-12 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-sm font-bold leading-none" style={{ color: pct === 100 ? '#4ade80' : 'white' }}>{pct}%</span>
              <span className="text-[9px] text-zinc-500 mt-0.5">done</span>
            </div>
            {order._count.notes > 0 && (
              <Link href={`/orders/${order.id}#notes`}
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}>
                💬 {order._count.notes}
              </Link>
            )}
          </div>
        </div>

        {/* Phase label */}
        <p className="text-xs font-medium" style={{ color: phase.color }}>▸ {phase.text}</p>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#818cf8,#38bdf8,#4ade80)' }} />
        </div>
      </div>

      {/* Stage badges */}
      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
        {a.notStarted > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(113,113,122,0.12)', color: '#a1a1aa', border: '1px solid rgba(113,113,122,0.2)' }}>
            Queue: {a.notStarted}
          </span>
        )}
        {PROD_STAGES.filter(s => s.key !== 'FINAL_ASSEMBLY').map((s) => {
          const display = order.units.filter(u =>
            u.currentStage === s.key && u.currentStatus !== 'BLOCKED' &&
            !u.readyForDispatch && !u.dispatchedAt && u.currentStage !== 'REWORK' &&
            !(u.currentStage === 'POWERSTAGE_MANUFACTURING' && u.currentStatus === 'PENDING')
          ).length;
          if (display <= 0) return null;
          return (
            <span key={s.key} className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: `${s.color}15`, color: s.color, border: `1px solid ${s.color}30` }}>
              {s.label}: {display}
            </span>
          );
        })}
        {a.inQC > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
            In QC: {a.inQC}
          </span>
        )}
        {a.passedQC > 0 && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>
            Final Assy: {a.passedQC}
          </span>
        )}
        {a.rework > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(249,115,22,0.12)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.3)' }}>
            <AlertTriangle className="w-4 h-4 mr-1 inline" /> Rework: {a.rework}
          </span>
        )}
        {a.blocked > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
            🚫 Blocked: {a.blocked}
          </span>
        )}
        {a.ready > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>
            <Check className="w-4 h-4" /> Ready: {a.ready}
          </span>
        )}
      </div>

      {/* Dispatch summary — single line; full DO/invoice/tracking detail on order page */}
      {a.dispatched > 0 && (
        <div className="border-t px-4 py-2.5 flex items-center gap-2 flex-wrap"
          style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          {a.dispatched < total ? (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
              Partial Dispatch
            </span>
          ) : (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
              Fully Dispatched
            </span>
          )}
          <span className="text-[10px] text-zinc-400">
            <Plane className="w-3 h-3 inline mr-1" />{a.dispatched} of {total} unit{total !== 1 ? 's' : ''}
            {order.dispatchOrders.at(-1)?.approvedAt
              ? ` · ${fmtDate(order.dispatchOrders.at(-1)!.approvedAt!)}`
              : ''}
          </span>
        </div>
      )}

      {/* Hover footer — view details */}
      <Link
        href={`/orders/${order.id}`}
        className="flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-150 border-t"
        style={{ borderColor: 'rgba(255,255,255,0.05)', color: '#38bdf8', background: 'rgba(14,165,233,0.05)' }}
      >
        View order details
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
}

export function ProformaList({
  proformas,
  role,
  initialTab,
  invoices = [],
  returnRequests = [],
  canCreate = false,
}: {
  proformas: ProformaRow[];
  role: string;
  initialTab?: TabKey;
  invoices?: InvoiceRow[];
  returnRequests?: ReturnRequestRow[];
  canCreate?: boolean;
}) {
  const [tab, setTab]               = useState<TabKey>(initialTab ?? 'pi');
  const [search, setSearch]         = useState('');
  const [invSubTab, setInvSubTab]   = useState<'current' | 'history'>('current');
  const [statusSubTab, setStatusSubTab] = useState<'processing' | 'completed'>('processing');
  const [openDOs,          setOpenDOs]          = useState<Record<string, boolean>>({});
  const [openHistoryMonths, setOpenHistoryMonths] = useState<Record<string, boolean>>({});

  // Current month key e.g. "2026-03"
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthLabel = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const piList       = proformas.filter((p) => p.invoiceNumber.startsWith('TSM/PI/') && p.invoiceType === 'SALE');
  const statusList   = proformas.filter((p) => p.status === 'CONVERTED' && p.order);
  const processingList = statusList.filter((p) => {
    const a = analyseUnits(p.order!.units);
    return (a.ready + a.dispatched) < p.order!.units.length;
  });
  const completedList = statusList.filter((p) => {
    const a = analyseUnits(p.order!.units);
    return p.order!.units.length > 0 && (a.ready + a.dispatched) === p.order!.units.length;
  });

  // Main tabs — Status is handled separately (no count clutter)
  const mainTabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'pi',      label: 'Proforma', count: piList.length         },
    { key: 'invoice', label: 'Invoice',  count: invoices.length       },
    { key: 'returns', label: 'Returns',  count: returnRequests.length },
  ];

  const filteredPI = piList.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.invoiceNumber.toLowerCase().includes(q) || p.client.customerName.toLowerCase().includes(q);
  });

  const filteredReturns = returnRequests.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.returnNumber.toLowerCase().includes(q) ||
      r.client.customerName.toLowerCase().includes(q) ||
      r.reportedIssue.toLowerCase().includes(q)
    );
  });

  const canCreateReturn = ['SALES', 'ADMIN'].includes(role);

  // Split invoices: current month vs history
  const currentInvoices = invoices.filter((inv) => {
    const d = new Date(inv.dispatchOrder?.approvedAt ?? inv.createdAt);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return k === currentMonthKey;
  });
  const historyInvoices = invoices.filter((inv) => {
    const d = new Date(inv.dispatchOrder?.approvedAt ?? inv.createdAt);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return k !== currentMonthKey;
  });

  // Apply search filter
  function matchesSearch(inv: InvoiceRow, q: string) {
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.client.customerName.toLowerCase().includes(q) ||
      (inv.dispatchOrder?.doNumber ?? '').toLowerCase().includes(q) ||
      (inv.dispatchOrder?.order?.orderNumber ?? '').toLowerCase().includes(q)
    );
  }
  const filteredCurrent = search
    ? currentInvoices.filter((inv) => matchesSearch(inv, search.toLowerCase()))
    : currentInvoices;
  const filteredHistory = search
    ? historyInvoices.filter((inv) => matchesSearch(inv, search.toLowerCase()))
    : historyInvoices;

  // DO groups for current tab; Month groups for history tab
  const currentDOGroups  = buildDOGroups(filteredCurrent);
  const historyMonthGroups = buildMonthGroups(filteredHistory);

  const toggleDO = (key: string) =>
    setOpenDOs((p) => ({ ...p, [key]: p[key] === false }));
  const toggleHistoryMonth = (key: string) =>
    setOpenHistoryMonths((p) => ({ ...p, [key]: !p[key] })); // default closed

  return (
    <div>
      {/* ── When on Status tab: clean header with no other tabs ── */}
      {tab === 'status' ? (
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={() => setTab('pi')}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 className="text-sm font-semibold text-white flex-1">Order Status</h3>
          <span className="text-[10px] px-2 py-1 rounded-lg font-medium"
            style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
            {processingList.length} processing · {completedList.length} completed
          </span>
        </div>
      ) : (
        /* ── Normal tab bar for PI / Invoice / Returns ── */
        <div className="flex items-center gap-2 mb-4">
          <div className="flex flex-1 gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {mainTabs.map((t) => (
              <button key={t.key} type="button" onClick={() => { setTab(t.key); setSearch(''); }}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                style={tab === t.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}>
                {t.label} ({t.count})
              </button>
            ))}
          </div>
          {tab === 'pi' && canCreate && (
            <Link href="/sales/new" className="shrink-0 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
              style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}>
              + New
            </Link>
          )}
          {tab === 'returns' && canCreateReturn && (
            <Link href="/sales/returns/new" className="shrink-0 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
              style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}>
              + New Return
            </Link>
          )}
        </div>
      )}

      {/* Search bar — hidden on Invoice/Current (shows all), visible on History & other tabs */}
      {!(tab === 'invoice' && invSubTab === 'current') && (
        <input
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-3"
          placeholder={
            tab === 'invoice' && invSubTab === 'history'
              ? 'Search history by customer, invoice no., or DO…'
              : tab === 'returns'
              ? 'Search by customer, return no., or issue…'
              : 'Search by customer or invoice no…'
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {/* List */}
      <div className="space-y-2">

        {/* ── PI tab ── */}
        {tab === 'pi' && (
          filteredPI.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm">No proforma invoices found.</p>
            </div>
          ) : (
            filteredPI.map((p) => {
              const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.DRAFT;
              return (
                <div key={p.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/sales/${p.id}`} className="flex-1 min-w-0 block">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm">{p.invoiceNumber}</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border" style={{ background: st.bg, color: st.color, borderColor: st.border }}>
                          {p.status.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{p.currency}</span>
                      </div>
                      <p className="text-zinc-400 text-sm mt-0.5">
                        {p.client.customerName}
                        {p.client.globalOrIndian ? ` · ${p.client.globalOrIndian}` : ''}
                      </p>
                      <p className="text-zinc-600 text-xs mt-0.5">
                        {fmtDate(p.invoiceDate)}
                        {' · '}{p._count.items} item{p._count.items !== 1 ? 's' : ''}
                        {role !== 'SALES' ? ` · ${p.createdBy.name}` : ''}
                      </p>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      <a href={`/print/proforma/${p.id}`} target="_blank" rel="noopener noreferrer" title="Download PDF"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-sky-400 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V8m0 8l-3-3m3 3l3-3M4 20h16" />
                        </svg>
                      </a>
                      <Link href={`/sales/${p.id}`}>
                        <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          )
        )}

        {/* ── Invoice tab — Current / History sub-tabs ── */}
        {tab === 'invoice' && (
          <div className="space-y-3">
            {/* Sub-tab toggle */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                type="button"
                onClick={() => { setInvSubTab('current'); setSearch(''); }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${invSubTab === 'current' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                style={invSubTab === 'current' ? { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' } : {}}
              >
                Current — {currentMonthLabel}
                <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={invSubTab === 'current'
                    ? { background: 'rgba(34,197,94,0.2)', color: '#4ade80' }
                    : { background: 'rgba(255,255,255,0.06)', color: '#71717a' }}>
                  {currentInvoices.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => { setInvSubTab('history'); setSearch(''); }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${invSubTab === 'history' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                style={invSubTab === 'history' ? { background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)' } : {}}
              >
                History
                <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={invSubTab === 'history'
                    ? { background: 'rgba(14,165,233,0.2)', color: '#38bdf8' }
                    : { background: 'rgba(255,255,255,0.06)', color: '#71717a' }}>
                  {historyInvoices.length}
                </span>
              </button>
            </div>

            {/* ── CURRENT: DO → Invoice folders (this month only) ── */}
            {invSubTab === 'current' && (
              currentDOGroups.length === 0 ? (
                <div className="card p-8 text-center">
                  <p className="text-zinc-500 text-sm">No invoices this month.</p>
                  {search && <p className="text-zinc-600 text-xs mt-1">Try clearing your search</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {currentDOGroups.map((grp) => {
                    const doOpen = openDOs[grp.key] !== false; // default open
                    return (
                      <InvoiceDOFolder
                        key={grp.key}
                        grp={grp}
                        isOpen={doOpen}
                        onToggle={() => toggleDO(grp.key)}
                        showTracking={true}
                        canEditTracking={role !== 'SALES'}
                      />
                    );
                  })}
                </div>
              )
            )}

            {/* ── HISTORY: Month (collapsed) → DO → Invoice ── */}
            {invSubTab === 'history' && (
              <>
                {historyMonthGroups.length === 0 ? (
                  <div className="card p-8 text-center">
                    {search
                      ? <p className="text-zinc-500 text-sm">No results for &ldquo;{search}&rdquo;</p>
                      : <p className="text-zinc-500 text-sm">No historical invoices found.</p>
                    }
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {historyMonthGroups.map((month) => {
                      // History months: collapsed by default, open when search active OR user clicked
                      const monthOpen = search ? true : !!openHistoryMonths[month.key];
                      return (
                        <div key={month.key} className="space-y-1.5">
                          {/* Month folder */}
                          <button
                            type="button"
                            onClick={() => toggleHistoryMonth(month.key)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-colors hover:bg-white/[0.03]"
                            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
                          >
                            <svg
                              width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                              className="shrink-0 text-sky-500"
                              style={{ transform: monthOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="shrink-0 text-sky-400">
                              <rect x="3" y="4" width="18" height="18" rx="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8"  y1="2" x2="8"  y2="6" />
                              <line x1="3"  y1="10" x2="21" y2="10" />
                            </svg>
                            <span className="font-semibold text-sm text-white flex-1">{month.label}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                              {month.count} invoice{month.count !== 1 ? 's' : ''}
                            </span>
                          </button>

                          {/* DO folders inside month */}
                          {monthOpen && (
                            <div className="ml-3 space-y-1.5">
                              {month.doGroups.map((grp) => {
                                const doOpen = openDOs[grp.key] !== false;
                                return (
                                  <InvoiceDOFolder
                                    key={grp.key}
                                    grp={grp}
                                    isOpen={doOpen}
                                    onToggle={() => toggleDO(grp.key)}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Status tab ── */}
        {tab === 'status' && (
          <div className="space-y-3">

            {/* Processing / Completed sub-tabs */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={() => setStatusSubTab('processing')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusSubTab === 'processing' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                style={statusSubTab === 'processing' ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}>
                Processing
                <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={statusSubTab === 'processing' ? { background: 'rgba(14,165,233,0.2)', color: '#38bdf8' } : { background: 'rgba(255,255,255,0.06)', color: '#71717a' }}>
                  {processingList.length}
                </span>
              </button>
              <button type="button" onClick={() => setStatusSubTab('completed')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusSubTab === 'completed' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                style={statusSubTab === 'completed' ? { background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' } : {}}>
                Completed
                <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={statusSubTab === 'completed' ? { background: 'rgba(34,197,94,0.2)', color: '#4ade80' } : { background: 'rgba(255,255,255,0.06)', color: '#71717a' }}>
                  {completedList.length}
                </span>
              </button>
            </div>

            {/* ── PROCESSING ── */}
            {statusSubTab === 'processing' && (
              processingList.length === 0 ? (
                <div className="card p-8 text-center">
                  <p className="text-zinc-500 text-sm">No orders currently in production.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {processingList.map((p) => <OrderStatusCard key={p.id} p={p} role={role} />)}
                </div>
              )
            )}

            {/* ── COMPLETED ── */}
            {statusSubTab === 'completed' && (
              completedList.length === 0 ? (
                <div className="card p-8 text-center">
                  <p className="text-zinc-500 text-sm">No completed orders yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {completedList.map((p) => {
                    const order = p.order!;
                    return (
                      <div key={p.id} className="card p-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs text-zinc-400">{p.invoiceNumber}</span>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-zinc-600">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <Link href={`/orders/${order.id}`}
                                className="font-mono text-xs text-sky-400 hover:text-sky-300 hover:underline font-semibold">
                                #{order.orderNumber}
                              </Link>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
                                <Check className="w-4 h-4" /> All dispatched
                              </span>
                            </div>
                            <p className="text-zinc-500 text-xs mt-0.5">{p.client.customerName} · {order.quantity} units</p>
                          </div>
                          {/* Dispatch summary — last DO tracking */}
                          {order.dispatchOrders.length > 0 && (() => {
                            const last = order.dispatchOrders[order.dispatchOrders.length - 1];
                            const tracking = last.invoices.map((inv) => parseTracking(inv.notes)).find((t) => t) ?? '';
                            return tracking ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
                                style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
                                <Truck className="w-4 h-4 inline mr-1" />{tracking}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* ── Returns tab ── */}
        {tab === 'returns' && (
          <>
            <div className="mb-2">
              <span className="text-xs text-zinc-500">{filteredReturns.length} return{filteredReturns.length !== 1 ? 's' : ''}</span>
            </div>
            {filteredReturns.length === 0 ? (
              <div className="card p-8 text-center">
                <p className="text-zinc-500 text-sm">No return requests found.</p>
              </div>
            ) : (
              filteredReturns.map((r) => {
                const st  = RETURN_STATUS_STYLE[r.status] ?? RETURN_STATUS_STYLE.REPORTED;
                const tst = RETURN_TYPE_STYLE[r.type]    ?? RETURN_TYPE_STYLE.OTHER;
                return (
                  <div key={r.id} className="card p-4">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono font-semibold text-sm">{r.returnNumber}</span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: st.bg, color: st.color }}>
                        {r.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: tst.bg, color: tst.color }}>
                        {tst.label}
                      </span>
                    </div>
                    <p className="text-zinc-300 text-sm">{r.client.customerName}</p>
                    <p className="text-zinc-500 text-xs mt-0.5 line-clamp-2">{r.reportedIssue}</p>
                    <p className="text-zinc-600 text-xs mt-1">
                      {fmtDate(r.createdAt)}
                      {' · '}by {r.reportedBy.name}
                      {r.serialNumber ? ` · SN: ${r.serialNumber}` : ''}
                    </p>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}
