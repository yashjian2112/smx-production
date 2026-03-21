'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DOApprovals } from './DOApprovals';
import { DispatchApprovals } from './DispatchApprovals';

// ---- Types ----

type ProformaRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  currency: string;
  client: { id: string; code: string; customerName: string; globalOrIndian: string | null };
  createdBy: { id: string; name: string };
  _count: { items: number };
};

type DORow = {
  id: string;
  doNumber: string;
  status: string;
  totalBoxes: number | null;
  submittedAt: string | null;
  approvedAt:  string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    orderNumber: string;
    quantity: number;
    client: {
      customerName: string;
      shippingAddress: string | null;
      billingAddress: string | null;
      gstNumber: string | null;
      globalOrIndian: string | null;
      state: string | null;
    } | null;
    product: { code: string; name: string };
  };
  createdBy:  { name: string };
  approvedBy: { name: string } | null;
  boxes: Array<{
    id: string;
    boxNumber: number;
    boxLabel: string;
    photoUrl: string | null;
    isSealed: boolean;
    createdAt: string;
    items: Array<{
      id: string;
      serial: string;
      barcode: string;
      scannedAt: string;
      unit: { serialNumber: string; finalAssemblyBarcode: string | null };
    }>;
  }>;
};

type DispatchRow = {
  id: string;
  dispatchNumber: string;
  status: string;
  isPartial: boolean;
  partialReason: string | null;
  boxPhotoUrl: string | null;
  submittedAt: string | null;
  items: Array<{
    id: string;
    serial: string;
    barcode: string;
    controllerPhotoUrl: string | null;
    scannedAt: string;
    unit: { serialNumber: string; finalAssemblyBarcode: string | null };
    scannedBy: { name: string };
  }>;
  order: {
    orderNumber: string;
    quantity: number;
    client: {
      customerName: string;
      shippingAddress: string | null;
      billingAddress: string | null;
      gstNumber: string | null;
      globalOrIndian: string | null;
      state: string | null;
    } | null;
    product: { code: string; name: string };
  };
  dispatchedBy: { name: string };
};

// ---- Style maps ----

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  DRAFT:            { bg: 'rgba(113,113,122,0.1)', color: '#a1a1aa', border: 'rgba(113,113,122,0.2)' },
  PENDING_APPROVAL: { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  APPROVED:         { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80', border: 'rgba(34,197,94,0.2)'  },
  REJECTED:         { bg: 'rgba(239,68,68,0.1)',   color: '#f87171', border: 'rgba(239,68,68,0.2)'  },
  CONVERTED:        { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---- Main component ----

export function AccountsPanel({
  proformas,
  dispatches,
  doDispatches,
}: {
  proformas: ProformaRow[];
  invoices?: unknown[];
  returns?: unknown[];
  dispatches: DispatchRow[];
  doDispatches: DORow[];
}) {
  const [showHistory, setShowHistory] = useState(false);

  // ── Pending ──────────────────────────────────────────────────────────────
  const pendingProformas  = proformas.filter((p) => p.status === 'PENDING_APPROVAL');
  const pendingDispatches = dispatches.length;
  const submittedDOs      = doDispatches.filter((d) => d.status === 'SUBMITTED');

  // ── Complete / History ────────────────────────────────────────────────────
  const historyDOs         = doDispatches.filter((d) => d.status !== 'SUBMITTED');
  const completedProformas = proformas.filter((p) =>
    ['APPROVED', 'CONVERTED', 'REJECTED'].includes(p.status)
  );

  const totalPending = pendingProformas.length + submittedDOs.length + pendingDispatches;

  return (
    <div className="space-y-4">

      {/* ── PENDING section ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-white">Pending</span>
          {totalPending > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
            >
              {totalPending}
            </span>
          )}
        </div>

        {totalPending === 0 && (
          <div className="card p-6 text-center">
            <p className="text-zinc-500 text-sm">No pending approvals.</p>
          </div>
        )}

        {/* Submitted Dispatch Orders */}
        {submittedDOs.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide mb-2">
              Dispatch Orders ({submittedDOs.length})
            </p>
            <DOApprovals dispatches={submittedDOs as any} />
          </div>
        )}

        {/* Legacy dispatch approvals */}
        {pendingDispatches > 0 && (
          <div className="mb-3">
            <p className="text-[10px] font-semibold text-sky-400 uppercase tracking-wide mb-2">
              Dispatches ({pendingDispatches})
            </p>
            <DispatchApprovals dispatches={dispatches as any} />
          </div>
        )}

        {/* Proforma approvals */}
        {pendingProformas.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-2">
              Invoices ({pendingProformas.length})
            </p>
            <div className="space-y-2">
              {pendingProformas.map((p) => (
                <div key={p.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm">{p.invoiceNumber}</span>
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                          style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)' }}
                        >
                          Pending Approval
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{p.currency}</span>
                      </div>
                      <p className="text-zinc-400 text-sm mt-0.5">{p.client.customerName}</p>
                      <p className="text-zinc-600 text-xs mt-0.5">
                        {fmtDate(p.invoiceDate)}
                        {' · '}{p._count.items} item{p._count.items !== 1 ? 's' : ''}
                        {' · '}by {p.createdBy.name}
                      </p>
                    </div>
                    <Link
                      href={`/sales/${p.id}`}
                      className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                      style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}
                    >
                      Review
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── COMPLETE / HISTORY section ───────────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-2 mb-3 w-full text-left"
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
            className="shrink-0 text-zinc-500 transition-transform"
            style={{ transform: showHistory ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-sm font-semibold text-zinc-400">Complete</span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(113,113,122,0.15)', color: '#71717a' }}
          >
            {historyDOs.length + completedProformas.length}
          </span>
        </button>

        {showHistory && (
          <div className="space-y-4">

            {/* Approved / Rejected DOs */}
            {historyDOs.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                  Dispatch Orders ({historyDOs.length})
                </p>
                <div className="space-y-2">
                  {historyDOs.map((d) => {
                    const allUnits  = d.boxes.flatMap((b) => b.items).length;
                    const isApproved = d.status === 'APPROVED';
                    return (
                      <div key={d.id} className="card p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-semibold text-sm">{d.doNumber}</span>
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={
                                  isApproved
                                    ? { background: 'rgba(34,197,94,0.1)',  color: '#4ade80' }
                                    : { background: 'rgba(239,68,68,0.1)',  color: '#f87171' }
                                }
                              >
                                {isApproved ? 'Approved' : 'Rejected'}
                              </span>
                            </div>
                            <p className="text-zinc-400 text-sm mt-0.5">
                              {d.order.client?.customerName ?? '—'} · Order #{d.order.orderNumber}
                            </p>
                            <p className="text-zinc-500 text-xs mt-0.5">
                              {d.order.product.name} · {allUnits} unit{allUnits !== 1 ? 's' : ''} · {d.boxes.length} box{d.boxes.length !== 1 ? 'es' : ''}
                            </p>
                            <p className="text-zinc-600 text-xs mt-0.5">
                              {isApproved
                                ? `Approved ${fmtDate(d.approvedAt)}${d.approvedBy ? ` by ${d.approvedBy.name}` : ''}`
                                : `Rejected ${fmtDate(d.approvedAt ?? d.updatedAt)}`}
                            </p>
                          </div>
                          <a
                            href={`/print/dispatch-order/${d.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View DO"
                            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-sky-400 transition-colors"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V8m0 8l-3-3m3 3l3-3M4 20h16" />
                            </svg>
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Approved / Converted / Rejected proformas */}
            {completedProformas.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                  Invoices ({completedProformas.length})
                </p>
                <div className="space-y-2">
                  {completedProformas.map((p) => {
                    const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.APPROVED;
                    return (
                      <div key={p.id} className="card p-4">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/sales/${p.id}`} className="flex-1 min-w-0 block">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-semibold text-sm">{p.invoiceNumber}</span>
                              <span
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                                style={{ background: st.bg, color: st.color, borderColor: st.border }}
                              >
                                {p.status.replace('_', ' ')}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{p.currency}</span>
                            </div>
                            <p className="text-zinc-400 text-sm mt-0.5">{p.client.customerName}</p>
                            <p className="text-zinc-600 text-xs mt-0.5">
                              {fmtDate(p.invoiceDate)}
                              {' · '}{p._count.items} item{p._count.items !== 1 ? 's' : ''}
                            </p>
                          </Link>
                          <Link
                            href={`/sales/${p.id}`}
                            className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-sky-400 transition-colors"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
