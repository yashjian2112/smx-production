'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface RawMaterial {
  id: string; name: string; code: string; unit: string; barcode?: string | null;
  currentStock: number; purchaseUnit?: string | null; conversionFactor?: number | null;
}

interface JobCardItem {
  id: string; rawMaterialId: string; quantityReq: number; quantityIssued: number;
  isCritical: boolean;
  rawMaterial: RawMaterial;
  batch?: { id: string; batchCode: string; remainingQty: number } | null;
}

interface JobCard {
  id: string; cardNumber: string; stage: string; status: string;
  dispatchType?: string | null;
  orderQuantity: number; createdAt: string; dispatchedAt?: string | null;
  order: { orderNumber: string };
  unit?: { serialNumber: string } | null;
  createdBy: { name: string };
  dispatchedBy?: { name: string } | null;
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
  PENDING:     { bg: 'rgba(251,191,36,0.08)',  text: '#fbbf24', dot: '#fbbf24' },
  DISPATCHED:  { bg: 'rgba(34,197,94,0.08)',   text: '#4ade80', dot: '#4ade80' },
  IN_PROGRESS: { bg: 'rgba(14,165,233,0.08)',  text: '#38bdf8', dot: '#38bdf8' },
  COMPLETED:   { bg: 'rgba(168,85,247,0.08)',  text: '#c084fc', dot: '#c084fc' },
  CANCELLED:   { bg: 'rgba(113,113,122,0.08)', text: '#71717a', dot: '#71717a' },
};

// ── Dispatch Modal ────────────────────────────────────────────────────────────
function DispatchModal({
  card, onClose, onDone
}: { card: JobCard; onClose: () => void; onDone: () => void }) {
  // issuedQty per item id, default = min(stock, required)
  const [qtys, setQtys] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const item of card.items) {
      const available = Math.min(item.rawMaterial.currentStock, item.quantityReq);
      m[item.id] = String(available);
    }
    return m;
  });
  const [scanInput, setScanInput]   = useState('');
  const [scannedId, setScannedId]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [criticalErrors, setCriticalErrors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  // Scan barcode → highlight that item
  function handleScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const val = scanInput.trim().toUpperCase();
    setScanInput('');
    const found = card.items.find(i =>
      i.rawMaterial.barcode?.toUpperCase() === val ||
      i.rawMaterial.code.toUpperCase() === val
    );
    if (found) {
      setScannedId(found.id);
      setTimeout(() => setScannedId(null), 2000);
    }
  }

  // Critical items check on the fly
  const criticalShort = card.items.filter(item => {
    if (!item.isCritical) return false;
    const issued = parseFloat(qtys[item.id] || '0');
    return issued < item.quantityReq;
  });

  const allItemsFull = card.items.every(item => {
    const issued = parseFloat(qtys[item.id] || '0');
    return issued >= item.quantityReq;
  });
  const dispatchLabel = allItemsFull ? 'Full Dispatch' : 'Partial Dispatch';

  async function handleDispatch() {
    setSubmitting(true); setError(''); setCriticalErrors([]);
    const items = card.items.map(item => ({
      jobCardItemId: item.id,
      issuedQty: parseFloat(qtys[item.id] || '0'),
    }));

    const res = await fetch(`/api/inventory/job-cards/${card.id}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });

    setSubmitting(false);
    if (res.ok) {
      onDone();
    } else {
      const data = await res.json();
      if (data.criticalErrors) setCriticalErrors(data.criticalErrors);
      else setError(data.error || 'Dispatch failed');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-800">
          <div>
            <p className="text-white font-semibold">{card.cardNumber}</p>
            <p className="text-zinc-500 text-xs">{card.order.orderNumber} · {card.orderQuantity} units · {STAGE_LABEL[card.stage] ?? card.stage}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg px-2">✕</button>
        </div>

        {/* Scan bar */}
        <div className="px-4 pt-3 pb-2 border-b border-zinc-800/50">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}>
            <span className="text-sky-400 text-sm">📷</span>
            <input
              ref={scanRef}
              type="text"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={handleScan}
              placeholder="Scan item barcode to highlight…"
              className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 outline-none font-mono"
            />
          </div>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {card.items.map(item => {
            const stock    = item.rawMaterial.currentStock;
            const need     = item.quantityReq;
            const issued   = parseFloat(qtys[item.id] || '0');
            const ok       = stock >= need;
            const stockLow = !ok && stock > 0;
            const noStock  = stock <= 0;
            const isScanned = scannedId === item.id;

            return (
              <div key={item.id}
                className="rounded-xl px-3 py-2.5 transition-all"
                style={{
                  background: isScanned ? 'rgba(14,165,233,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isScanned ? 'rgba(14,165,233,0.4)' : item.isCritical ? 'rgba(251,113,133,0.2)' : 'rgba(255,255,255,0.05)'}`,
                }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-emerald-400' : stockLow ? 'bg-amber-400' : 'bg-red-400'}`} />
                  <span className="text-zinc-500 font-mono text-[10px]">{item.rawMaterial.barcode ?? item.rawMaterial.code}</span>
                  <span className="text-zinc-200 text-sm flex-1 truncate">{item.rawMaterial.name}</span>
                  {item.isCritical && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'rgba(251,113,133,0.12)', color: '#fb7185' }}>CRITICAL</span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Stock info */}
                  <div className="flex-1 text-xs text-zinc-500">
                    Need: <span className="text-zinc-300">{fmt(need)} {item.rawMaterial.unit}</span>
                    {' · '}
                    Stock: <span className={ok ? 'text-emerald-400' : stockLow ? 'text-amber-400' : 'text-red-400'}>
                      {noStock ? 'None' : fmt(stock)}
                    </span>
                  </div>
                  {/* Qty input */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={Math.min(stock, need)}
                      step="any"
                      value={qtys[item.id]}
                      onChange={e => setQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      className="w-20 text-right text-sm font-mono text-white bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 outline-none focus:border-sky-500"
                    />
                    <span className="text-zinc-500 text-xs">{item.rawMaterial.unit}</span>
                  </div>
                </div>

                {/* Issued qty indicator */}
                {issued > 0 && issued < need && (
                  <p className="text-[10px] text-amber-400 mt-1">
                    Issuing {fmt(issued)} of {fmt(need)} — shortfall of {fmt(need - issued)}
                    {item.isCritical && ' ⚠ CRITICAL ITEM'}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Errors */}
        {(criticalErrors.length > 0 || error) && (
          <div className="px-4 py-2 border-t border-red-900/30" style={{ background: 'rgba(239,68,68,0.06)' }}>
            {criticalErrors.map((e, i) => (
              <p key={i} className="text-red-400 text-xs">⛔ {e}</p>
            ))}
            {error && <p className="text-red-400 text-xs">⛔ {error}</p>}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center gap-3">
          {/* Dispatch type preview */}
          <div className="flex-1">
            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${allItemsFull ? 'text-emerald-400 bg-emerald-900/20' : 'text-amber-400 bg-amber-900/20'}`}>
              {dispatchLabel}
            </span>
            {criticalShort.length > 0 && (
              <p className="text-red-400 text-[10px] mt-0.5">{criticalShort.length} critical item{criticalShort.length > 1 ? 's' : ''} insufficient</p>
            )}
          </div>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-zinc-400 border border-zinc-700">Cancel</button>
          <button
            onClick={handleDispatch}
            disabled={submitting || criticalShort.length > 0}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: criticalShort.length > 0 ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.8)' }}>
            {submitting ? 'Dispatching…' : `Dispatch (${dispatchLabel})`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function JobCardsPanel({ sessionRole }: { sessionRole: string }) {
  const [tab,        setTab]        = useState<'pending' | 'dispatched' | 'completed'>('pending');
  const [cards,      setCards]      = useState<JobCard[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<JobCard | null>(null);

  const canDispatch = ['INVENTORY_MANAGER', 'STORE_MANAGER', 'ADMIN'].includes(sessionRole);

  const load = useCallback(async () => {
    setLoading(true);
    const statusMap = { pending: 'PENDING', dispatched: 'DISPATCHED', completed: 'COMPLETED' };
    const res = await fetch(`/api/inventory/job-cards?status=${statusMap[tab]}`);
    if (res.ok) setCards(await res.json());
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'pending',    label: 'Pending' },
    { key: 'dispatched', label: 'Dispatched' },
    { key: 'completed',  label: 'Completed' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 pb-24">
      <div className="pt-6 pb-4">
        <h1 className="text-white text-xl font-bold">Job Cards</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Material dispatch for production stages</p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.key ? 'bg-sky-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-zinc-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-4xl mb-3">📋</div>
          <p className="text-zinc-400 text-sm">No {tab} job cards</p>
          {tab === 'pending' && <p className="text-zinc-600 text-xs mt-1">Created when production employees accept an order</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(card => {
            const sc     = STATUS_COLOR[card.status] ?? STATUS_COLOR.CANCELLED;
            const isOpen = expanded === card.id;
            const criticalCount = card.items.filter(i => i.isCritical).length;
            const lowCritical   = card.items.filter(i => i.isCritical && i.rawMaterial.currentStock < i.quantityReq).length;

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
                        {card.dispatchType && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${card.dispatchType === 'FULL' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-amber-900/30 text-amber-400'}`}>
                            {card.dispatchType === 'FULL' ? 'Full' : 'Partial'}
                          </span>
                        )}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                          {STAGE_LABEL[card.stage] ?? card.stage.replace(/_/g, ' ')}
                        </span>
                        {lowCritical > 0 && card.status === 'PENDING' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">
                            ⛔ {lowCritical} critical short
                          </span>
                        )}
                      </div>

                      <p className="text-zinc-400 text-xs mt-1.5">
                        Order <span className="text-zinc-300">{card.order.orderNumber}</span>
                        {' · '}<span className="text-zinc-300">{card.orderQuantity} unit{card.orderQuantity !== 1 ? 's' : ''}</span>
                        {' · '}By <span className="text-zinc-300">{card.createdBy.name}</span>
                      </p>
                      {card.dispatchedAt && (
                        <p className="text-zinc-500 text-xs mt-0.5">
                          Dispatched by {card.dispatchedBy?.name ?? '—'} · {fmtDate(card.dispatchedAt)}
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
                      <button
                        onClick={() => window.open(`/print/job-card/${card.id}`, '_blank')}
                        className="px-2 py-1.5 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white transition-colors"
                        title="Print Job Card">
                        🖨
                      </button>
                      {canDispatch && card.status === 'PENDING' && (
                        <button onClick={() => setDispatching(card)}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all"
                          style={{ background: 'rgba(34,197,94,0.8)' }}>
                          Dispatch
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items preview (collapsed view) */}
                {isOpen && card.items.length > 0 && (
                  <div className="border-t border-zinc-800/60 px-3 py-3 space-y-1">
                    <div className="flex items-center gap-2 px-1 mb-2">
                      <p className="text-zinc-600 text-[10px] uppercase tracking-wide flex-1">
                        {card.items.length} components
                        {criticalCount > 0 && ` · ${criticalCount} critical`}
                      </p>
                    </div>
                    {card.items.map(item => {
                      const stock  = item.rawMaterial.currentStock;
                      const need   = item.quantityReq;
                      const ok     = stock >= need;
                      const low    = !ok && stock > 0;

                      return (
                        <div key={item.id} className="flex items-center gap-2 text-xs py-1.5 px-3 rounded-lg"
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: item.isCritical ? '1px solid rgba(251,113,133,0.15)' : '1px solid rgba(255,255,255,0.04)'
                          }}>
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-emerald-400' : low ? 'bg-amber-400' : 'bg-red-400'}`} />
                          <span className="text-zinc-500 font-mono text-[10px] shrink-0">{item.rawMaterial.barcode ?? item.rawMaterial.code}</span>
                          <span className="text-zinc-300 flex-1 truncate">{item.rawMaterial.name}</span>
                          {item.isCritical && <span className="text-[10px] text-rose-400 shrink-0">★</span>}
                          <span className="text-amber-300 font-medium shrink-0">{fmt(need)} {item.rawMaterial.unit}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${ok ? 'text-emerald-400 bg-emerald-900/20' : low ? 'text-amber-400 bg-amber-900/20' : 'text-red-400 bg-red-900/20'}`}>
                            {fmt(stock)} stk
                          </span>
                          {item.quantityIssued > 0 && (
                            <span className="text-emerald-400 text-[10px] shrink-0">✓ {fmt(item.quantityIssued)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dispatch Modal */}
      {dispatching && (
        <DispatchModal
          card={dispatching}
          onClose={() => setDispatching(null)}
          onDone={() => { setDispatching(null); load(); }}
        />
      )}
    </div>
  );
}
