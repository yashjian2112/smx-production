'use client';

import { useState, useEffect, useCallback } from 'react';

interface RawMaterial {
  id: string; name: string; code: string; unit: string; barcode?: string | null;
  currentStock: number; purchaseUnit?: string | null; conversionFactor?: number | null;
}

interface JobCardItem {
  id: string; rawMaterialId: string; quantityReq: number; quantityIssued: number;
  rawMaterial: RawMaterial;
  batch?: { id: string; batchCode: string; remainingQty: number } | null;
}

interface JobCard {
  id: string; cardNumber: string; stage: string; status: string;
  orderQuantity: number; createdAt: string; issuedAt?: string | null;
  order: { orderNumber: string };
  unit?: { serialNumber: string } | null;
  createdBy: { name: string };
  issuedBy?: { name: string } | null;
  items: JobCardItem[];
}

const fmt     = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const STAGE_LABEL: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage', BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY: 'Assembly', QC_AND_SOFTWARE: 'QC & Software',
  REWORK: 'Rework', FINAL_ASSEMBLY: 'Final Assembly',
};

const STATUS_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  PENDING:   { bg: 'rgba(251,191,36,0.08)',  text: '#fbbf24', dot: '#fbbf24' },
  ISSUED:    { bg: 'rgba(34,197,94,0.08)',   text: '#4ade80', dot: '#4ade80' },
  COMPLETED: { bg: 'rgba(14,165,233,0.08)',  text: '#38bdf8', dot: '#38bdf8' },
  CANCELLED: { bg: 'rgba(113,113,122,0.08)', text: '#71717a', dot: '#71717a' },
};

function StockIndicator({ item }: { item: JobCardItem }) {
  const stock = item.rawMaterial.currentStock;
  const need  = item.quantityReq;
  const hasPack = item.rawMaterial.purchaseUnit && item.rawMaterial.conversionFactor;
  const ok    = stock >= need;
  const low   = stock > 0 && stock < need;

  return (
    <div className="flex items-center gap-2 text-xs py-1.5 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-emerald-400' : low ? 'bg-amber-400' : 'bg-red-400'}`} />
      <span className="text-zinc-500 font-mono text-[10px] shrink-0">{item.rawMaterial.barcode ?? item.rawMaterial.code}</span>
      <span className="text-zinc-300 flex-1 truncate">{item.rawMaterial.name}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-amber-300 font-medium">{fmt(need)} {item.rawMaterial.unit}</span>
        {hasPack && (
          <span className="text-zinc-600 text-[10px]">
            ({Math.ceil(need / item.rawMaterial.conversionFactor!)} {item.rawMaterial.purchaseUnit})
          </span>
        )}
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${ok ? 'text-emerald-400 bg-emerald-900/20' : low ? 'text-amber-400 bg-amber-900/20' : 'text-red-400 bg-red-900/20'}`}>
          {fmt(stock)} in stock
        </span>
        {item.quantityIssued > 0 && (
          <span className="text-emerald-400 text-[10px]">✓ {fmt(item.quantityIssued)}</span>
        )}
      </div>
    </div>
  );
}

export default function JobCardsPanel({ sessionRole }: { sessionRole: string }) {
  const [tab,       setTab]       = useState<'pending' | 'issued' | 'completed'>('pending');
  const [cards,     setCards]     = useState<JobCard[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [error,     setError]     = useState('');
  const [expanded,  setExpanded]  = useState<string | null>(null);

  const canIssue = ['INVENTORY_MANAGER', 'STORE_MANAGER', 'ADMIN'].includes(sessionRole);

  const load = useCallback(async () => {
    setLoading(true);
    const statusMap = { pending: 'PENDING', issued: 'ISSUED', completed: 'COMPLETED' };
    const res = await fetch(`/api/inventory/job-cards?status=${statusMap[tab]}`);
    if (res.ok) setCards(await res.json());
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  async function handleIssue(id: string) {
    setIssuingId(id); setError('');
    const res = await fetch(`/api/inventory/job-cards/${id}/issue`, { method: 'POST' });
    setIssuingId(null);
    if (res.ok) { setExpanded(null); load(); }
    else { const e = await res.json(); setError(e.error || 'Failed to issue'); }
  }

  function insufficientCount(card: JobCard) {
    return card.items.filter(i => i.rawMaterial.currentStock < i.quantityReq).length;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24">
      <div className="pt-6 pb-4">
        <h1 className="text-white text-xl font-bold">Job Cards</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Material issuance for production stages</p>
      </div>

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
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-zinc-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-4xl mb-3">📋</div>
          <p className="text-zinc-400 text-sm">No {tab} job cards</p>
          {tab === 'pending' && <p className="text-zinc-600 text-xs mt-1">Created by production employees when starting a stage</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(card => {
            const sc     = STATUS_COLOR[card.status] ?? STATUS_COLOR.CANCELLED;
            const insuf  = insufficientCount(card);
            const isOpen = expanded === card.id;

            return (
              <div key={card.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: sc.dot }} />
                          <span className="text-white font-semibold font-mono text-sm">{card.cardNumber}</span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: sc.bg, color: sc.text }}>
                          {card.status}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                          {STAGE_LABEL[card.stage] ?? card.stage.replace(/_/g, ' ')}
                        </span>
                        {insuf > 0 && card.status === 'PENDING' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">
                            ⚠ {insuf} low stock
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-400 text-xs mt-1.5">
                        Order <span className="text-zinc-300">{card.order.orderNumber}</span>
                        {' · '}<span className="text-zinc-300">{card.orderQuantity} unit{card.orderQuantity !== 1 ? 's' : ''}</span>
                        {' · '}By <span className="text-zinc-300">{card.createdBy.name}</span>
                      </p>
                      {card.issuedAt && (
                        <p className="text-zinc-500 text-xs mt-0.5">
                          Issued by {card.issuedBy?.name ?? '—'} · {fmtDate(card.issuedAt)}
                        </p>
                      )}
                      <p className="text-zinc-700 text-[10px] mt-0.5">{fmtDate(card.createdAt)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0 items-center">
                      {card.items.length > 0 && (
                        <button onClick={() => setExpanded(isOpen ? null : card.id)}
                          className="px-2 py-1 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white transition-colors">
                          {isOpen ? '▲ Hide' : `▼ ${card.items.length} items`}
                        </button>
                      )}
                      {canIssue && card.status === 'PENDING' && (
                        <button onClick={() => handleIssue(card.id)} disabled={issuingId === card.id}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                          style={{ background: issuingId === card.id ? 'rgba(34,197,94,0.4)' : 'rgba(34,197,94,0.8)' }}>
                          {issuingId === card.id ? 'Issuing…' : 'Issue All'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {isOpen && card.items.length > 0 && (
                  <div className="border-t border-zinc-800/60 px-3 py-3 space-y-1">
                    <p className="text-zinc-600 text-[10px] uppercase tracking-wide px-1 mb-2">
                      {card.items.length} components · live stock levels
                    </p>
                    {card.items.map(item => (
                      <StockIndicator key={item.id} item={item} />
                    ))}
                    {canIssue && card.status === 'PENDING' && insuf > 0 && (
                      <div className="mt-2 px-3 py-2 rounded-lg text-xs text-amber-400 border border-amber-900/30" style={{ background: 'rgba(251,191,36,0.06)' }}>
                        ⚠ {insuf} component{insuf > 1 ? 's' : ''} have insufficient stock. Issuing will deduct whatever is available.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
