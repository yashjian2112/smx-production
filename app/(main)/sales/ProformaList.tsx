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

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  DRAFT:            { bg: 'rgba(113,113,122,0.1)', color: '#a1a1aa', border: 'rgba(113,113,122,0.2)' },
  PENDING_APPROVAL: { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  APPROVED:         { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80', border: 'rgba(34,197,94,0.2)'  },
  REJECTED:         { bg: 'rgba(239,68,68,0.1)',   color: '#f87171', border: 'rgba(239,68,68,0.2)'  },
  CONVERTED:        { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
};

const TYPE_LABEL: Record<string, string> = { SALE: 'Sale', RETURN: 'Return', REPLACEMENT: 'Replacement' };

export function ProformaList({ proformas, role }: { proformas: ProformaRow[]; role: string }) {
  const [tab, setTab]       = useState<'pi' | 'invoice' | 'replace' | 'return'>('pi');
  const [search, setSearch] = useState('');

  // PI tab  = SALE type, not yet converted (active pipeline)
  const piList       = proformas.filter((p) => p.invoiceType === 'SALE' && p.status !== 'CONVERTED');
  // Invoice tab = SALE type, converted to order
  const invoiceList  = proformas.filter((p) => p.invoiceType === 'SALE' && p.status === 'CONVERTED');
  // Replace tab = REPLACEMENT type
  const replaceList  = proformas.filter((p) => p.invoiceType === 'REPLACEMENT');
  // Return tab  = RETURN type
  const returnList   = proformas.filter((p) => p.invoiceType === 'RETURN');

  const list =
    tab === 'pi'      ? piList :
    tab === 'invoice' ? invoiceList :
    tab === 'replace' ? replaceList :
    returnList;

  const filtered = list.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.invoiceNumber.toLowerCase().includes(q) || p.client.customerName.toLowerCase().includes(q);
  });

  const tabs: Array<{ key: 'pi' | 'invoice' | 'replace' | 'return'; label: string; count: number }> = [
    { key: 'pi',      label: 'PI',      count: piList.length },
    { key: 'invoice', label: 'Invoice', count: invoiceList.length },
    { key: 'replace', label: 'Replace', count: replaceList.length },
    { key: 'return',  label: 'Return',  count: returnList.length },
  ];

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
        {filtered.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-zinc-500 text-sm">
              {tab === 'pi'      ? 'No active proforma invoices.' :
               tab === 'invoice' ? 'No converted invoices yet.' :
               tab === 'replace' ? 'No replacement invoices.' :
               'No return invoices.'}
            </p>
          </div>
        ) : (
          filtered.map((p) => {
            const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.DRAFT;
            return (
              <Link key={p.id} href={`/sales/${p.id}`} className="card-interactive block p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
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
                      {new Date(p.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' · '}{p._count.items} item{p._count.items !== 1 ? 's' : ''}
                      {role !== 'SALES' ? ` · ${p.createdBy.name}` : ''}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-zinc-600 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
