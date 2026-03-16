'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

type ProformaRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceType: string;
  currency: string;
  status: string;
  client: { id: string; code: string; customerName: string; globalOrIndian: string | null };
  createdBy: { id: string; name: string };
  _count: { items: number };
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  subType: string;
  currency: string;
  createdAt: string;
  client: { id: string; code: string; customerName: string; globalOrIndian: string | null };
  dispatchOrder: { doNumber: string; approvedAt: string | null } | null;
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

type OrderStatusRow = {
  id: string;
  orderNumber: string;
  productName: string;
  clientName: string | null;
  quantity: number;
  status: string;
  stages: { PS: number; BB: number; CA: number; QC: number; RW: number; FA: number };
  readyForDispatch: number;
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

const STAGE_LABELS: Array<{ key: keyof OrderStatusRow['stages']; label: string; color: string }> = [
  { key: 'PS', label: 'PS', color: '#818cf8' },
  { key: 'BB', label: 'BB', color: '#34d399' },
  { key: 'CA', label: 'CA', color: '#60a5fa' },
  { key: 'QC', label: 'QC', color: '#fbbf24' },
  { key: 'RW', label: 'RW', color: '#f87171' },
  { key: 'FA', label: 'FA', color: '#4ade80' },
];

type TabKey = 'pi' | 'invoice' | 'returns' | 'status';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ProformaList({
  proformas,
  role,
  initialTab,
  invoices = [],
  returnRequests = [],
}: {
  proformas: ProformaRow[];
  role: string;
  initialTab?: TabKey;
  invoices?: InvoiceRow[];
  returnRequests?: ReturnRequestRow[];
}) {
  const [tab, setTab] = useState<TabKey>(initialTab ?? 'pi');
  const [search, setSearch] = useState('');

  // Status tab state
  const [statusData,    setStatusData]    = useState<OrderStatusRow[]>([]);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusFetched, setStatusFetched] = useState(false);

  useEffect(() => {
    if (tab === 'status' && !statusFetched) {
      setStatusLoading(true);
      fetch('/api/orders/status-summary')
        .then((r) => r.json())
        .then((data: OrderStatusRow[]) => {
          setStatusData(data);
          setStatusFetched(true);
        })
        .catch(() => { setStatusFetched(true); })
        .finally(() => setStatusLoading(false));
    }
  }, [tab, statusFetched]);

  const piList = proformas.filter((p) => p.invoiceNumber.startsWith('TSM/PI/') && p.invoiceType === 'SALE');

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'pi',      label: 'Proforma',  count: piList.length         },
    { key: 'invoice', label: 'Invoice',   count: invoices.length       },
    { key: 'returns', label: 'Returns',   count: returnRequests.length },
    { key: 'status',  label: 'Status',    count: 0                     },
  ];

  const filteredPI = piList.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.invoiceNumber.toLowerCase().includes(q) || p.client.customerName.toLowerCase().includes(q);
  });

  const filteredInvoices = invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.client.customerName.toLowerCase().includes(q) ||
      (inv.dispatchOrder?.doNumber ?? '').toLowerCase().includes(q)
    );
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

  const canCreateReturn = ['SALES', 'ADMIN', 'ACCOUNTS', 'PRODUCTION_MANAGER'].includes(role);

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === t.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}>
            {t.key === 'status' ? 'Status' : `${t.label} (${t.count})`}
          </button>
        ))}
      </div>

      {/* Search — not shown on status tab */}
      {tab !== 'status' && (
        <input
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-3"
          placeholder="Search…"
          value={search} onChange={(e) => setSearch(e.target.value)}
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
                      <a
                        href={`/print/proforma/${p.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Download PDF"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-sky-400 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
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

        {/* ── Invoice tab ── */}
        {tab === 'invoice' && (
          filteredInvoices.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm">No invoices found.</p>
            </div>
          ) : (
            filteredInvoices.map((inv) => {
              const st = SUBTYPE_STYLE[inv.subType] ?? SUBTYPE_STYLE.FULL;
              const dispatchDate = inv.dispatchOrder?.approvedAt ?? inv.createdAt;
              return (
                <div key={inv.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={`/print/invoice/${inv.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0 block"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm">{inv.invoiceNumber}</span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                          style={{ background: st.bg, color: st.color, borderColor: st.color + '44' }}
                        >
                          {st.label}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{inv.currency}</span>
                      </div>
                      <p className="text-zinc-400 text-sm mt-0.5">
                        {inv.client.customerName}
                        {inv.client.globalOrIndian ? ` · ${inv.client.globalOrIndian}` : ''}
                      </p>
                      <p className="text-zinc-600 text-xs mt-0.5">
                        {fmtDate(dispatchDate)}
                        {inv.dispatchOrder ? ` · ${inv.dispatchOrder.doNumber}` : ''}
                        {' · '}{inv._count.items} item{inv._count.items !== 1 ? 's' : ''}
                      </p>
                    </a>
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      <a
                        href={`/print/invoice/${inv.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Download PDF"
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-sky-400 transition-colors"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V8m0 8l-3-3m3 3l3-3M4 20h16" />
                        </svg>
                      </a>
                      <a href={`/print/invoice/${inv.id}`} target="_blank" rel="noopener noreferrer">
                        <svg className="w-4 h-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })
          )
        )}

        {/* ── Returns tab ── */}
        {tab === 'returns' && (
          <>
            {/* Header with New Return button */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-500">{filteredReturns.length} return{filteredReturns.length !== 1 ? 's' : ''}</span>
              {canCreateReturn && (
                <Link
                  href="/sales/returns/new"
                  className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}
                >
                  + New Return
                </Link>
              )}
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
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {r.status.replace(/_/g, ' ')}
                      </span>
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ background: tst.bg, color: tst.color }}
                      >
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

        {/* ── Status tab ── */}
        {tab === 'status' && (
          statusLoading ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm">Loading…</p>
            </div>
          ) : statusData.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm">No active orders found.</p>
            </div>
          ) : (
            statusData.map((order) => {
              const stages = order.stages;
              const inProduction = stages.PS + stages.BB + stages.CA + stages.QC + stages.RW;
              const inFinalAssembly = stages.FA;
              const completed = order.readyForDispatch;
              const remaining = order.quantity - completed;

              // Human-readable status summary
              let statusLine = '';
              if (completed === order.quantity) {
                statusLine = `All ${order.quantity} units complete — ready to dispatch`;
              } else if (completed > 0) {
                statusLine = `${completed} unit${completed !== 1 ? 's' : ''} complete · ${remaining} remaining`;
              } else if (inFinalAssembly > 0) {
                statusLine = `${inFinalAssembly} unit${inFinalAssembly !== 1 ? 's' : ''} in final assembly`;
              } else if (inProduction > 0) {
                statusLine = `Manufacturing in progress · ${inProduction} unit${inProduction !== 1 ? 's' : ''} being built`;
              } else {
                statusLine = 'Waiting to start';
              }

              const pct = order.quantity > 0 ? Math.round((completed / order.quantity) * 100) : 0;

              return (
                <div key={order.id} className="card p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm text-white">{order.orderNumber}</span>
                        {completed === order.quantity && order.quantity > 0 ? (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}>
                            Ready ✓
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>
                            Manufacturing
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-400 text-sm mt-0.5">
                        {order.productName}{order.clientName ? ` · ${order.clientName}` : ''}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-zinc-300 shrink-0">{pct}%</span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: pct === 100
                          ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                          : 'linear-gradient(90deg,#38bdf8,#0ea5e9)',
                      }}
                    />
                  </div>

                  {/* Status line */}
                  <p className="text-xs text-zinc-400">{statusLine}</p>

                  {/* Stage pills — only show non-zero stages */}
                  <div className="flex flex-wrap gap-1.5">
                    {STAGE_LABELS.map(({ key, label, color }) => {
                      const count = stages[key];
                      if (count === 0) return null;
                      return (
                        <span
                          key={key}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded"
                          style={{ background: `${color}15`, border: `1px solid ${color}35`, color }}
                        >
                          {label} · {count}
                        </span>
                      );
                    })}
                    {completed > 0 && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80' }}>
                        Done · {completed}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )
        )}
      </div>
    </div>
  );
}
