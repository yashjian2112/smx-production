'use client';

import Link from 'next/link';
import { useState } from 'react';

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

const TYPE_LABEL: Record<string, string> = { SALE: 'Sale', RETURN: 'Return', REPLACEMENT: 'Replacement' };

type TabKey = 'pi' | 'invoice' | 'returns';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ProformaList({
  proformas,
  role,
  initialTab,
  invoices = [],
}: {
  proformas: ProformaRow[];
  role: string;
  initialTab?: TabKey;
  invoices?: InvoiceRow[];
}) {
  const [tab, setTab]       = useState<TabKey>(initialTab ?? 'pi');
  const [search, setSearch] = useState('');

  const piList      = proformas.filter((p) => p.invoiceNumber.startsWith('TSM/PI/') && p.invoiceType === 'SALE');
  const returnsList = proformas.filter((p) => p.invoiceType === 'RETURN' || p.invoiceType === 'REPLACEMENT');

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'pi',      label: 'PI',                    count: piList.length      },
    ...(role !== 'SALES' ? [{ key: 'invoice' as TabKey, label: 'Invoice', count: invoices.length }] : []),
    { key: 'returns', label: 'Returns & Replacement', count: returnsList.length },
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

  const filteredReturns = returnsList.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.invoiceNumber.toLowerCase().includes(q) || p.client.customerName.toLowerCase().includes(q);
  });

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === t.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-3"
        placeholder="Search by invoice no. or client…"
        value={search} onChange={(e) => setSearch(e.target.value)}
      />

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
                    {/* Left — click links to print page as detail view */}
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

                    {/* Right — PDF download + chevron (both go to print page) */}
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
                      <a
                        href={`/print/invoice/${inv.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
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
          filteredReturns.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm">No returns or replacements found.</p>
            </div>
          ) : (
            filteredReturns.map((p) => {
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
                        {p.invoiceType !== 'SALE' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">
                            {TYPE_LABEL[p.invoiceType]}
                          </span>
                        )}
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
      </div>
    </div>
  );
}
