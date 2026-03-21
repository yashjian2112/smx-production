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

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  subType: string;
  currency: string;
  createdAt: string;
  totalAmount: number;
  client: { id: string; code: string; customerName: string; globalOrIndian: string | null };
  dispatchOrder: { doNumber: string; approvedAt: string | null; order: { orderNumber: string } | null } | null;
  _count: { items: number };
};

type ReturnRow = {
  id: string;
  returnNumber: string;
  type: string;
  status: string;
  reportedIssue: string;
  serialNumber: string | null;
  createdAt: string;
  client: { code: string; customerName: string };
  reportedBy: { name: string };
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

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

type TabKey = 'approvals' | 'dispatch' | 'invoices' | 'returns';

// ---- Main component ----

export function AccountsPanel({
  proformas,
  invoices,
  returns,
  dispatches,
  doDispatches,
}: {
  proformas: ProformaRow[];
  invoices: InvoiceRow[];
  returns: ReturnRow[];
  dispatches: DispatchRow[];
  doDispatches: DORow[];
}) {
  const [tab, setTab] = useState<TabKey>('approvals');
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const pendingProformas  = proformas.filter((p) => p.status === 'PENDING_APPROVAL');
  const pendingDispatches = dispatches.length;
  const submittedDOs      = doDispatches.filter((d) => d.status === 'SUBMITTED');
  const historyDOs        = doDispatches.filter((d) => d.status !== 'SUBMITTED');

  const totalApprovals = pendingProformas.length + submittedDOs.length + pendingDispatches;

  const tabs: Array<{ key: TabKey; label: string; count: number | null }> = [
    { key: 'approvals', label: 'Approvals', count: totalApprovals > 0 ? totalApprovals : null },
    { key: 'dispatch',  label: 'Dispatch',  count: doDispatches.length > 0 ? doDispatches.length : null },
    { key: 'invoices',  label: 'Invoices',  count: invoices.length  },
    { key: 'returns',   label: 'Returns',   count: returns.length   },
  ];

  const filteredInvoices = invoices.filter((inv) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.client.customerName.toLowerCase().includes(q) ||
      (inv.dispatchOrder?.doNumber ?? '').toLowerCase().includes(q)
    );
  });

  const filteredReturns = returns.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.returnNumber.toLowerCase().includes(q) ||
      r.client.customerName.toLowerCase().includes(q) ||
      r.reportedIssue.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => { setTab(t.key); setSearch(''); }}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors relative ${tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === t.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}
          >
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span
                className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={
                  t.key === 'approvals'
                    ? { background: 'rgba(251,191,36,0.2)', color: '#fbbf24' }
                    : { background: 'rgba(14,165,233,0.15)', color: '#38bdf8' }
                }
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Approvals tab ── */}
      {tab === 'approvals' && (
        <div className="space-y-4">
          {/* DO Approvals — only SUBMITTED */}
          {submittedDOs.length > 0 && (
            <DOApprovals dispatches={submittedDOs as any} />
          )}

          {/* Legacy dispatch approvals */}
          {pendingDispatches > 0 && (
            <DispatchApprovals dispatches={dispatches as any} />
          )}

          {/* Proforma approval queue */}
          {pendingProformas.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-white">Invoice Approvals</div>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
                >
                  {pendingProformas.length}
                </span>
              </div>
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
          )}

          {totalApprovals === 0 && (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm">No pending approvals.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Dispatch tab ── */}
      {tab === 'dispatch' && (
        <div className="space-y-3">
          {doDispatches.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm">No dispatch orders found.</p>
            </div>
          ) : (
            <>
              {/* Pending approval */}
              {submittedDOs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                    Awaiting Approval ({submittedDOs.length})
                  </p>
                  <DOApprovals dispatches={submittedDOs as any} />
                </div>
              )}

              {/* History */}
              {historyDOs.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mt-2">
                    History ({historyDOs.length})
                  </p>
                  {historyDOs.map((d) => {
                    const allUnits = d.boxes.flatMap((b) => b.items).length;
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
              )}
            </>
          )}
        </div>
      )}

      {/* ── Invoices tab — grouped by Dispatch Order ── */}
      {tab === 'invoices' && (() => {
        // Group filtered invoices by DO (or 'no-do' for invoices without a dispatch order)
        const groups: { key: string; doNumber: string | null; orderNumber: string | null; clientName: string; date: string; invoices: InvoiceRow[] }[] = [];
        const seen = new Map<string, number>();
        for (const inv of filteredInvoices) {
          const key = inv.dispatchOrder?.doNumber ?? `no-do-${inv.id}`;
          if (!seen.has(key)) {
            seen.set(key, groups.length);
            groups.push({
              key,
              doNumber:    inv.dispatchOrder?.doNumber ?? null,
              orderNumber: inv.dispatchOrder?.order?.orderNumber ?? null,
              clientName:  inv.client.customerName,
              date:        inv.dispatchOrder?.approvedAt ?? inv.createdAt,
              invoices:    [],
            });
          }
          groups[seen.get(key)!].invoices.push(inv);
        }

        return (
          <div>
            <input
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-3"
              placeholder="Search by invoice no., client, or DO…"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
            <div className="space-y-2">
              {groups.length === 0 ? (
                <div className="card p-8 text-center">
                  <p className="text-zinc-500 text-sm">No invoices found.</p>
                </div>
              ) : (
                groups.map((grp) => {
                  const isOpen = openGroups[grp.key] !== false; // default open
                  return (
                    <div key={grp.key} className="card overflow-hidden">
                      {/* Folder header */}
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                        onClick={() => setOpenGroups((p) => ({ ...p, [grp.key]: !isOpen }))}
                      >
                        <svg
                          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                          className="shrink-0 text-sky-400 transition-transform"
                          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-amber-400">
                          <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {grp.doNumber && (
                              <span className="font-mono font-semibold text-sm text-white">{grp.doNumber}</span>
                            )}
                            {grp.orderNumber && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">#{grp.orderNumber}</span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                              {grp.invoices.length} invoice{grp.invoices.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <p className="text-zinc-500 text-xs mt-0.5">{grp.clientName} · {fmtDate(grp.date)}</p>
                        </div>
                      </button>

                      {/* Invoices inside folder */}
                      {isOpen && (
                        <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                          {grp.invoices.map((inv, idx) => {
                            const st = SUBTYPE_STYLE[inv.subType] ?? SUBTYPE_STYLE.FULL;
                            return (
                              <div
                                key={inv.id}
                                className="flex items-center gap-3 px-4 py-2.5"
                                style={idx < grp.invoices.length - 1 ? { borderBottom: '1px solid rgba(255,255,255,0.04)' } : {}}
                              >
                                {/* indent line */}
                                <div className="w-px h-5 shrink-0 ml-1" style={{ background: 'rgba(255,255,255,0.12)' }} />
                                <a href={`/print/invoice/${inv.id}`} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-sm text-sky-400 hover:text-sky-300 hover:underline">{inv.invoiceNumber}</span>
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                                    style={{ background: st.bg, color: st.color, borderColor: st.color + '44' }}
                                  >
                                    {st.label}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{inv.currency}</span>
                                  {inv.totalAmount > 0 && (
                                    <span className="text-xs text-zinc-500">{inv.currency} {inv.totalAmount.toLocaleString('en-IN')}</span>
                                  )}
                                </a>
                                <a
                                  href={`/print/invoice/${inv.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="View / Download PDF"
                                  className="shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-zinc-500 hover:text-sky-400 transition-colors"
                                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                                >
                                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
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
                })
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Returns tab ── */}
      {tab === 'returns' && (
        <div>
          <input
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-3"
            placeholder="Search by return no., client, or issue…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <div className="space-y-2">
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
          </div>
        </div>
      )}
    </div>
  );
}
