'use client';

import { useState, useEffect, useCallback } from 'react';

interface JobCardItem {
  id: string;
  rawMaterialId: string;
  quantityReq: number;
  quantityIssued: number;
  rawMaterial: { id: string; name: string; code: string; unit: string; barcode?: string | null };
  batch?: { id: string; batchCode: string; remainingQty: number } | null;
}

interface JobCard {
  id: string;
  cardNumber: string;
  stage: string;
  status: string;
  createdAt: string;
  issuedAt?: string | null;
  order: { orderNumber: string };
  unit: { serialNumber: string };
  createdBy: { name: string };
  issuedBy?: { name: string } | null;
  items: JobCardItem[];
}

const fmt   = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const map: Record<string, string> = {
    red:    'bg-red-900/30 text-red-400',
    yellow: 'bg-yellow-900/30 text-yellow-400',
    green:  'bg-emerald-900/30 text-emerald-400',
    sky:    'bg-sky-900/30 text-sky-400',
    zinc:   'bg-zinc-800 text-zinc-400',
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[color] ?? map.zinc}`}>{children}</span>;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'yellow', ISSUED: 'green', COMPLETED: 'sky', CANCELLED: 'zinc',
};

export default function JobCardsPanel({ sessionRole }: { sessionRole: string }) {
  const [tab,       setTab]       = useState<'pending' | 'issued' | 'completed'>('pending');
  const [cards,     setCards]     = useState<JobCard[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [error,     setError]     = useState('');
  const [expanded,  setExpanded]  = useState<string | null>(null);

  const canIssue = ['INVENTORY_MANAGER', 'STORE_MANAGER', 'ADMIN'].includes(sessionRole);

  const STATUS_MAP = { pending: 'PENDING', issued: 'ISSUED', completed: 'COMPLETED' };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/inventory/job-cards?status=${STATUS_MAP[tab]}`);
    if (res.ok) setCards(await res.json());
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  async function handleIssue(id: string) {
    setIssuingId(id); setError('');
    const res = await fetch(`/api/inventory/job-cards/${id}/issue`, { method: 'POST' });
    setIssuingId(null);
    if (res.ok) load();
    else { const e = await res.json(); setError(e.error || 'Failed to issue'); }
  }

  const tabCounts = { pending: tab === 'pending' ? cards.length : 0, issued: tab === 'issued' ? cards.length : 0, completed: tab === 'completed' ? cards.length : 0 };

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24">
      {/* Header */}
      <div className="pt-6 pb-4">
        <h1 className="text-white text-xl font-bold">Job Cards</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Material issuance for production stages</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {(['pending', 'issued', 'completed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-sky-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg text-red-400 text-sm border border-red-900/40" style={{ background: 'rgba(239,68,68,0.08)' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-zinc-400 text-sm py-8 text-center">Loading…</p>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-zinc-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-4xl mb-3">📋</div>
          <p className="text-zinc-400 text-sm">No {tab} job cards</p>
          {tab === 'pending' && <p className="text-zinc-600 text-xs mt-1">Job cards are created by production staff when starting a stage</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(card => (
            <div key={card.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
              {/* Card header */}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold font-mono">{card.cardNumber}</span>
                      <Badge color={STATUS_COLOR[card.status] ?? 'zinc'}>{card.status}</Badge>
                      <Badge color="sky">{card.stage.replace(/_/g, ' ')}</Badge>
                    </div>
                    <p className="text-zinc-400 text-xs mt-1.5">
                      Order: <span className="text-zinc-300">{card.order.orderNumber}</span>
                      {' · '}Serial: <span className="text-zinc-300">{card.unit.serialNumber}</span>
                      {' · '}By: <span className="text-zinc-300">{card.createdBy.name}</span>
                    </p>
                    {card.issuedAt && (
                      <p className="text-zinc-500 text-xs mt-0.5">
                        Issued by {card.issuedBy?.name ?? '—'} · {fmtDate(card.issuedAt)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0 items-center">
                    {card.items.length > 0 && (
                      <button onClick={() => setExpanded(expanded === card.id ? null : card.id)}
                        className="px-2 py-1 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white transition-colors">
                        {expanded === card.id ? '▲' : `${card.items.length} items`}
                      </button>
                    )}
                    {canIssue && card.status === 'PENDING' && (
                      <button onClick={() => handleIssue(card.id)} disabled={issuingId === card.id}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50">
                        {issuingId === card.id ? 'Issuing…' : 'Issue'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Items expansion */}
              {expanded === card.id && card.items.length > 0 && (
                <div className="border-t border-zinc-800/60 px-4 py-3 space-y-1.5">
                  {card.items.map(item => (
                    <div key={item.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <span className="text-zinc-500 font-mono">{item.rawMaterial.barcode ?? item.rawMaterial.code}</span>
                      <span className="text-zinc-300 flex-1">{item.rawMaterial.name}</span>
                      <span className="text-amber-400 font-medium">{fmt(item.quantityReq)} {item.rawMaterial.unit}</span>
                      {item.quantityIssued > 0 && (
                        <span className="text-emerald-400">✓ {fmt(item.quantityIssued)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
