'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Check, ClipboardList, ScanLine, ArrowLeft } from 'lucide-react';

interface RawMaterial {
  id: string; name: string; code: string; unit: string; barcode?: string | null;
  currentStock: number;
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

// ── Full-screen scan panel for dispatching a job card ─────────────────────────
function JobCardScanPanel({ card, onClose, onDone }: { card: JobCard; onClose: () => void; onDone: () => void }) {
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanInput, setScanInput] = useState('');
  const [scanned, setScanned]     = useState<Record<string, number>>({}); // itemId → scanned count
  const [lastScan, setLastScan]   = useState<{ text: string; ok: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => { scanRef.current?.focus(); }, []);

  const totalQtyNeeded  = card.items.reduce((s, i) => s + i.quantityReq, 0);
  const totalQtyScanned = card.items.reduce((s, i) => s + (scanned[i.id] ?? 0), 0);
  const allScanned      = card.items.every(i => (scanned[i.id] ?? 0) >= i.quantityReq);

  function handleScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const val = scanInput.trim().toUpperCase();
    setScanInput('');
    if (!val) return;

    // Find an item that still needs more scans
    const found = card.items.find(i =>
      (i.rawMaterial.barcode?.toUpperCase() === val || i.rawMaterial.code.toUpperCase() === val)
      && (scanned[i.id] ?? 0) < i.quantityReq
    );

    if (found) {
      const newCount = (scanned[found.id] ?? 0) + 1;
      setScanned(prev => ({ ...prev, [found.id]: newCount }));
      setLastScan({ text: `${found.rawMaterial.name} (${newCount}/${fmt(found.quantityReq)})`, ok: true });
    } else {
      // Check if fully scanned already
      const fullyDone = card.items.find(i =>
        (i.rawMaterial.barcode?.toUpperCase() === val || i.rawMaterial.code.toUpperCase() === val)
        && (scanned[i.id] ?? 0) >= i.quantityReq
      );
      if (fullyDone) {
        setLastScan({ text: `${fullyDone.rawMaterial.name} — all ${fmt(fullyDone.quantityReq)} already scanned`, ok: false });
      } else {
        setLastScan({ text: `"${val}" not found in this job card`, ok: false });
      }
    }

    setTimeout(() => setLastScan(null), 3000);
    scanRef.current?.focus();
  }

  function undoScan(itemId: string) {
    setScanned(prev => {
      const cur = prev[itemId] ?? 0;
      if (cur <= 1) { const n = { ...prev }; delete n[itemId]; return n; }
      return { ...prev, [itemId]: cur - 1 };
    });
  }

  async function handleDispatch() {
    setSubmitting(true);
    setError('');
    const items = card.items.map(item => ({
      jobCardItemId: item.id,
      issuedQty: scanned[item.id] ?? 0,
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
      if (data.criticalErrors) setError(data.criticalErrors.join('\n'));
      else if (data.stockErrors) setError(data.stockErrors.join('\n'));
      else setError(data.error || 'Dispatch failed');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgb(9,9,11)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <button onClick={onClose} className="text-zinc-400 hover:text-white p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">{card.cardNumber}</p>
          <p className="text-zinc-500 text-xs">{card.order.orderNumber} · {card.orderQuantity} units · {STAGE_LABEL[card.stage] ?? card.stage}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold" style={{ color: allScanned ? '#4ade80' : '#fbbf24' }}>{totalQtyScanned}/{fmt(totalQtyNeeded)}</p>
          <p className="text-zinc-600 text-[10px]">scans</p>
        </div>
      </div>

      {/* Scan input */}
      <div className="px-4 py-4 border-b border-zinc-800/50" style={{ background: 'rgba(14,165,233,0.03)' }}>
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'rgba(14,165,233,0.08)', border: '2px solid rgba(14,165,233,0.25)' }}>
          <ScanLine className="w-6 h-6 text-sky-400 shrink-0" />
          <input
            ref={scanRef}
            type="text"
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            onKeyDown={handleScan}
            placeholder="Scan item barcode..."
            autoFocus
            className="flex-1 bg-transparent text-lg text-white placeholder-zinc-600 outline-none font-mono"
          />
        </div>
        {lastScan && (
          <div className={`mt-2 px-4 py-2 rounded-xl text-sm font-medium ${lastScan.ok ? 'text-emerald-400 bg-emerald-900/20' : 'text-red-400 bg-red-900/20'}`}>
            {lastScan.ok ? <Check className="w-4 h-4 inline mr-1.5" /> : <X className="w-4 h-4 inline mr-1.5" />}
            {lastScan.text}
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {card.items.map(item => {
          const qty   = scanned[item.id] ?? 0;
          const need  = item.quantityReq;
          const done  = qty >= need;
          const stock = item.rawMaterial.currentStock;
          const ok    = stock >= need;
          const pct   = need > 0 ? Math.min(100, (qty / need) * 100) : 0;

          return (
            <div key={item.id}
              className="rounded-xl px-3 py-2.5 transition-all"
              style={{
                background: done ? 'rgba(34,197,94,0.08)' : qty > 0 ? 'rgba(14,165,233,0.06)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${done ? 'rgba(34,197,94,0.25)' : item.isCritical ? 'rgba(251,113,133,0.2)' : 'rgba(255,255,255,0.05)'}`,
              }}>
              <div className="flex items-center gap-3">
                {/* Status circle */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500' : qty > 0 ? 'bg-sky-600' : 'bg-zinc-800'}`}>
                  {done ? <Check className="w-4 h-4 text-white" /> : qty > 0 ? <span className="text-white text-[10px] font-bold">{qty}</span> : <span className="w-2 h-2 rounded-full" style={{ background: ok ? '#4ade80' : stock > 0 ? '#fbbf24' : '#f87171' }} />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-200 text-sm truncate">{item.rawMaterial.name}</span>
                    {item.isCritical && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0" style={{ background: 'rgba(251,113,133,0.12)', color: '#fb7185' }}>CRITICAL</span>
                    )}
                    {/* Scan count */}
                    <span className={`text-xs font-mono shrink-0 ${done ? 'text-emerald-400' : qty > 0 ? 'text-sky-400' : 'text-zinc-600'}`}>
                      {qty}/{fmt(need)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-zinc-600 font-mono text-[10px]">{item.rawMaterial.barcode ?? item.rawMaterial.code}</span>
                    <span className={`text-[10px] ${ok ? 'text-emerald-400' : stock > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      Stock: {stock <= 0 ? 'None' : fmt(stock)}
                    </span>
                  </div>
                  {/* Progress bar */}
                  {need > 1 && (
                    <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: done ? '#4ade80' : '#38bdf8' }} />
                    </div>
                  )}
                </div>

                {qty > 0 && (
                  <button onClick={() => undoScan(item.id)} className="text-zinc-500 hover:text-red-400 p-1 shrink-0" title="Undo one scan">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 border-t border-red-900/30" style={{ background: 'rgba(239,68,68,0.06)' }}>
          <p className="text-red-400 text-xs whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-4 border-t border-zinc-800 flex items-center gap-3" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="flex-1">
          {allScanned ? (
            <span className="text-emerald-400 text-sm font-medium">All items scanned — ready to dispatch</span>
          ) : totalQtyScanned > 0 ? (
            <span className="text-amber-400 text-sm">{totalQtyScanned}/{fmt(totalQtyNeeded)} scans</span>
          ) : (
            <span className="text-zinc-500 text-sm">Scan items to begin</span>
          )}
        </div>
        <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-zinc-400 border border-zinc-700">Cancel</button>
        <button
          onClick={handleDispatch}
          disabled={submitting || !allScanned}
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
          style={{ background: 'rgba(34,197,94,0.9)' }}>
          {submitting ? 'Dispatching...' : 'Dispatch'}
        </button>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function JobCardsPanel({ sessionRole }: { sessionRole: string }) {
  const [tab,      setTab]      = useState<'pending' | 'dispatched' | 'completed'>('pending');
  const [cards,    setCards]    = useState<JobCard[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scanning, setScanning] = useState<JobCard | null>(null);

  const canDispatch = ['INVENTORY_MANAGER', 'ADMIN'].includes(sessionRole);

  const load = useCallback(async () => {
    setLoading(true);
    const statusMap = { pending: 'PENDING', dispatched: 'DISPATCHED', completed: 'COMPLETED' };
    const res = await fetch(`/api/inventory/job-cards?status=${statusMap[tab]}`);
    if (res.ok) setCards(await res.json());
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  // Full-screen scan mode
  if (scanning) {
    return <JobCardScanPanel card={scanning} onClose={() => setScanning(null)} onDone={() => { setScanning(null); load(); }} />;
  }

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
          <div className="flex justify-center mb-3"><ClipboardList className="w-8 h-8 text-zinc-600" /></div>
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
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                          {STAGE_LABEL[card.stage] ?? card.stage.replace(/_/g, ' ')}
                        </span>
                        {lowCritical > 0 && card.status === 'PENDING' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">
                            {lowCritical} critical short
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
                          {isOpen ? 'Hide' : `${card.items.length} items`}
                        </button>
                      )}
                      <button
                        onClick={() => window.open(`/print/job-card/${card.id}`, '_blank')}
                        className="px-2 py-1.5 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white transition-colors"
                        title="Print Job Card">
                        Print
                      </button>
                      {canDispatch && card.status === 'PENDING' && (
                        <button onClick={() => setScanning(card)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all"
                          style={{ background: 'rgba(34,197,94,0.8)' }}>
                          <ScanLine className="w-4 h-4" /> Scan & Dispatch
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items preview */}
                {isOpen && card.items.length > 0 && (
                  <div className="border-t border-zinc-800/60 px-3 py-3 space-y-1">
                    <p className="text-zinc-600 text-[10px] uppercase tracking-wide px-1 mb-2">
                      {card.items.length} components
                      {criticalCount > 0 && ` · ${criticalCount} critical`}
                    </p>
                    {card.items.map(item => {
                      const stock = item.rawMaterial.currentStock;
                      const need  = item.quantityReq;
                      const ok    = stock >= need;
                      const low   = !ok && stock > 0;

                      return (
                        <div key={item.id} className="flex items-center gap-2 text-xs py-1.5 px-3 rounded-lg"
                          style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: item.isCritical ? '1px solid rgba(251,113,133,0.15)' : '1px solid rgba(255,255,255,0.04)'
                          }}>
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-emerald-400' : low ? 'bg-amber-400' : 'bg-red-400'}`} />
                          <span className="text-zinc-500 font-mono text-[10px] shrink-0">{item.rawMaterial.barcode ?? item.rawMaterial.code}</span>
                          <span className="text-zinc-300 flex-1 truncate">{item.rawMaterial.name}</span>
                          {item.isCritical && <span className="text-[9px] px-1 py-0.5 rounded font-bold shrink-0" style={{ background: 'rgba(251,113,133,0.12)', color: '#fb7185' }}>CRITICAL</span>}
                          <span className="text-amber-300 font-medium shrink-0">{fmt(need)} {item.rawMaterial.unit}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${ok ? 'text-emerald-400 bg-emerald-900/20' : low ? 'text-amber-400 bg-amber-900/20' : 'text-red-400 bg-red-900/20'}`}>
                            {fmt(stock)} stk
                          </span>
                          {item.quantityIssued > 0 && (
                            <span className="text-emerald-400 text-[10px] shrink-0 inline-flex items-center"><Check className="w-4 h-4 mr-1 inline" />{fmt(item.quantityIssued)}</span>
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
    </div>
  );
}
