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
  // scanned count per item id (increments on each barcode scan)
  const [counts, setCounts]         = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    card.items.forEach(i => { m[i.id] = 0; });
    return m;
  });
  const [scanInput, setScanInput]   = useState('');
  const [lastScanned, setLastScanned] = useState<{ id: string; ok: boolean } | null>(null);
  const [notFound, setNotFound]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [criticalErrors, setCriticalErrors] = useState<string[]>([]);
  const [error, setError]           = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  // Focus scan input on open
  useEffect(() => { scanRef.current?.focus(); }, []);

  // Each scan increments count by 1
  function handleScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const val = scanInput.trim().toUpperCase();
    setScanInput('');
    if (!val) return;

    const found = card.items.find(i =>
      i.rawMaterial.barcode?.toUpperCase() === val ||
      i.rawMaterial.code.toUpperCase() === val
    );

    if (!found) {
      setNotFound(true);
      setTimeout(() => setNotFound(false), 1500);
      return;
    }

    // Increment scan count (cap at required qty)
    setCounts(prev => {
      const current = prev[found.id] ?? 0;
      const newCount = Math.min(current + 1, found.quantityReq);
      return { ...prev, [found.id]: newCount };
    });

    setLastScanned({ id: found.id, ok: true });
    setTimeout(() => setLastScanned(null), 1200);
    setNotFound(false);
  }

  // Manual override — type qty directly
  function setManual(id: string, val: string) {
    const n = parseFloat(val) || 0;
    const item = card.items.find(i => i.id === id);
    const max = item ? item.quantityReq : 9999;
    setCounts(prev => ({ ...prev, [id]: Math.min(n, max) }));
  }

  const criticalShort = card.items.filter(item =>
    item.isCritical && (counts[item.id] ?? 0) < item.quantityReq
  );
  const allDone      = card.items.every(i => (counts[i.id] ?? 0) >= i.quantityReq);
  const anyScanned   = card.items.some(i => (counts[i.id] ?? 0) > 0);
  const dispatchLabel = allDone ? 'Full Dispatch' : 'Partial Dispatch';
  const doneCount    = card.items.filter(i => (counts[i.id] ?? 0) >= i.quantityReq).length;

  async function handleDispatch() {
    setSubmitting(true); setError(''); setCriticalErrors([]);
    const items = card.items.map(item => ({
      jobCardItemId: item.id,
      issuedQty: counts[item.id] ?? 0,
    }));
    const res = await fetch(`/api/inventory/job-cards/${card.id}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    setSubmitting(false);
    if (res.ok) { onDone(); return; }
    const data = await res.json();
    if (data.criticalErrors) setCriticalErrors(data.criticalErrors);
    else setError(data.error || 'Dispatch failed');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-800">
          <div>
            <p className="text-white font-semibold">{card.cardNumber}</p>
            <p className="text-zinc-500 text-xs">{card.order.orderNumber} · {card.orderQuantity} units · {STAGE_LABEL[card.stage] ?? card.stage}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">
              <span className="text-white font-semibold">{doneCount}</span>/{card.items.length} verified
            </span>
            <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg px-1">✕</button>
          </div>
        </div>

        {/* Scan bar */}
        <div className="px-4 pt-3 pb-3 border-b border-zinc-800/50">
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all ${notFound ? 'border-red-500/60' : lastScanned ? 'border-emerald-500/60' : 'border-sky-500/20'}`}
            style={{ background: notFound ? 'rgba(239,68,68,0.08)' : lastScanned ? 'rgba(34,197,94,0.08)' : 'rgba(14,165,233,0.06)', border: `1px solid ${notFound ? 'rgba(239,68,68,0.4)' : lastScanned ? 'rgba(34,197,94,0.4)' : 'rgba(14,165,233,0.2)'}` }}>
            <span className="text-lg">{notFound ? '❌' : lastScanned ? '✅' : '📷'}</span>
            <input
              ref={scanRef}
              type="text"
              value={scanInput}
              onChange={e => setScanInput(e.target.value)}
              onKeyDown={handleScan}
              placeholder="Scan barcode — each scan adds 1"
              className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 outline-none font-mono"
              autoFocus
            />
          </div>
          {notFound && <p className="text-red-400 text-xs mt-1.5 px-1">⚠ Barcode not found in this job card</p>}
          {lastScanned && (
            <p className="text-emerald-400 text-xs mt-1.5 px-1">
              ✓ {card.items.find(i => i.id === lastScanned.id)?.rawMaterial.name} — {counts[lastScanned.id]}/{card.items.find(i => i.id === lastScanned.id)?.quantityReq}
            </p>
          )}
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {card.items.map(item => {
            const need      = item.quantityReq;
            const scanned   = counts[item.id] ?? 0;
            const done      = scanned >= need;
            const partial   = scanned > 0 && !done;
            const isActive  = lastScanned?.id === item.id;
            const stockOk   = item.rawMaterial.currentStock >= need;

            return (
              <div key={item.id}
                className="rounded-xl px-3 py-2.5 transition-all"
                style={{
                  background: done ? 'rgba(34,197,94,0.06)' : isActive ? 'rgba(14,165,233,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${done ? 'rgba(34,197,94,0.3)' : isActive ? 'rgba(14,165,233,0.4)' : item.isCritical ? 'rgba(251,113,133,0.2)' : 'rgba(255,255,255,0.05)'}`,
                }}>

                {/* Top row: barcode + name + critical + done check */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-zinc-500 font-mono text-[10px] shrink-0">{item.rawMaterial.barcode ?? item.rawMaterial.code}</span>
                  <span className="text-zinc-200 text-sm flex-1 truncate font-medium">{item.rawMaterial.name}</span>
                  {item.isCritical && <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0" style={{ background: 'rgba(251,113,133,0.12)', color: '#fb7185' }}>CRITICAL</span>}
                  {done && <span className="text-emerald-400 text-lg shrink-0">✓</span>}
                </div>

                {/* Bottom row: progress bar + count */}
                <div className="flex items-center gap-3">
                  {/* Progress bar */}
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min((scanned / need) * 100, 100)}%`,
                        background: done ? '#4ade80' : partial ? '#fbbf24' : '#38bdf8',
                      }} />
                  </div>

                  {/* Count display — tap to edit manually */}
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min={0}
                      max={need}
                      value={scanned}
                      onChange={e => setManual(item.id, e.target.value)}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      className={`w-12 text-center text-sm font-mono font-bold rounded-lg px-1 py-0.5 outline-none border ${done ? 'text-emerald-400 bg-emerald-900/20 border-emerald-800' : 'text-white bg-zinc-800 border-zinc-700'}`}
                    />
                    <span className="text-zinc-500 text-xs">/ {fmt(need)} {item.rawMaterial.unit}</span>
                  </div>
                </div>

                {/* Stock warning */}
                {!stockOk && (
                  <p className="text-[10px] text-amber-400 mt-1.5">
                    ⚠ Only {fmt(item.rawMaterial.currentStock)} in stock{item.isCritical ? ' — CRITICAL' : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Errors */}
        {(criticalErrors.length > 0 || error) && (
          <div className="px-4 py-2 border-t border-red-900/30" style={{ background: 'rgba(239,68,68,0.06)' }}>
            {criticalErrors.map((e, i) => <p key={i} className="text-red-400 text-xs">⛔ {e}</p>)}
            {error && <p className="text-red-400 text-xs">⛔ {error}</p>}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-800 flex items-center gap-3">
          <div className="flex-1">
            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${allDone ? 'text-emerald-400 bg-emerald-900/20' : anyScanned ? 'text-amber-400 bg-amber-900/20' : 'text-zinc-500 bg-zinc-800'}`}>
              {allDone ? '✓ Full Dispatch' : anyScanned ? `Partial Dispatch · ${doneCount}/${card.items.length}` : 'Scan items to begin'}
            </span>
            {criticalShort.length > 0 && (
              <p className="text-red-400 text-[10px] mt-0.5">⛔ {criticalShort.length} critical item{criticalShort.length > 1 ? 's' : ''} not fully scanned</p>
            )}
          </div>
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-zinc-400 border border-zinc-700">Cancel</button>
          <button
            onClick={handleDispatch}
            disabled={submitting || !anyScanned || criticalShort.length > 0}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
            style={{ background: criticalShort.length > 0 ? 'rgba(239,68,68,0.5)' : allDone ? 'rgba(34,197,94,0.85)' : 'rgba(251,191,36,0.8)' }}>
            {submitting ? 'Dispatching…' : `Dispatch`}
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
