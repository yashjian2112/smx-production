'use client';

import { useState, useEffect, useCallback } from 'react';
import { ScanInput } from '@/components/ScanInput';

interface RawMaterial {
  id: string; name: string; code: string; unit: string; barcode?: string | null;
  currentStock: number; purchaseUnit?: string | null; conversionFactor?: number | null;
}

interface JobCardItem {
  id: string; rawMaterialId: string; quantityReq: number; quantityIssued: number;
  isCritical: boolean; verifiedQty: number; isVerified: boolean; returnedQty: number;
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

// ── Dispatch Screen (Fullscreen) ──────────────────────────────────────────────
function DispatchModal({
  card, onClose, onDone
}: { card: JobCard; onClose: () => void; onDone: () => void }) {
  const [counts, setCounts]           = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    card.items.forEach(i => { m[i.id] = 0; });
    return m;
  });
  const [scanVal, setScanVal]         = useState('');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [notFound, setNotFound]       = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [criticalErrors, setCriticalErrors] = useState<string[]>([]);
  const [error, setError]             = useState('');

  function processScan(raw: string) {
    const val = raw.trim().toUpperCase();
    if (!val) return;
    const found = card.items.find(i =>
      i.rawMaterial.barcode?.toUpperCase() === val ||
      i.rawMaterial.code.toUpperCase() === val
    );
    if (!found) {
      setNotFound(true); setLastScanned(null);
      setTimeout(() => setNotFound(false), 1500);
      return;
    }
    setNotFound(false);
    setCounts(prev => ({ ...prev, [found.id]: Math.min((prev[found.id] ?? 0) + 1, found.quantityReq) }));
    setLastScanned(found.id);
    setTimeout(() => setLastScanned(null), 1200);
  }

  const criticalShort = card.items.filter(i => i.isCritical && (counts[i.id] ?? 0) < i.quantityReq);
  const allDone       = card.items.every(i => (counts[i.id] ?? 0) >= i.quantityReq);
  const anyScanned    = card.items.some(i => (counts[i.id] ?? 0) > 0);
  const doneCount     = card.items.filter(i => (counts[i.id] ?? 0) >= i.quantityReq).length;

  async function handleDispatch() {
    setSubmitting(true); setError(''); setCriticalErrors([]);
    const res = await fetch(`/api/inventory/job-cards/${card.id}/dispatch`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: card.items.map(item => ({ jobCardItemId: item.id, issuedQty: counts[item.id] ?? 0 })) }),
    });
    setSubmitting(false);
    if (res.ok) { onDone(); return; }
    const data = await res.json();
    if (data.criticalErrors) setCriticalErrors(data.criticalErrors);
    else setError(data.error || 'Dispatch failed');
  }

  const lastItem = lastScanned ? card.items.find(i => i.id === lastScanned) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0f0f0f' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 border-b border-zinc-800/60"
        style={{ paddingTop: 'max(env(safe-area-inset-top),16px)', paddingBottom: 12 }}>
        <div>
          <p className="text-white font-bold text-base">{card.cardNumber}</p>
          <p className="text-zinc-500 text-xs">{card.order.orderNumber} · {card.orderQuantity} unit{card.orderQuantity !== 1 ? 's' : ''} · {STAGE_LABEL[card.stage] ?? card.stage}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-white font-bold text-lg leading-none">{doneCount}</p>
            <p className="text-zinc-600 text-[10px]">of {card.items.length}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white" style={{ background: 'rgba(255,255,255,0.08)' }}>✕</button>
        </div>
      </div>

      {/* Scan bar */}
      <div className="px-4 py-3 border-b border-zinc-800/40">
        <div className="flex items-center gap-2 px-3 py-3 rounded-2xl transition-all"
          style={{
            background: notFound ? 'rgba(239,68,68,0.08)' : lastScanned ? 'rgba(34,197,94,0.08)' : 'rgba(14,165,233,0.06)',
            border: `1.5px solid ${notFound ? 'rgba(239,68,68,0.5)' : lastScanned ? 'rgba(34,197,94,0.5)' : 'rgba(14,165,233,0.25)'}`,
          }}>
          <span className="text-xl shrink-0">{notFound ? '❌' : lastScanned ? '✅' : '📦'}</span>
          <ScanInput
            value={scanVal}
            onChange={setScanVal}
            onScan={processScan}
            placeholder="Scan barcode (+1 each scan)"
            autoFocus
            scannerTitle="Scan Component"
            scannerHint="Point at the component barcode"
          />
        </div>
        <div className="mt-2 min-h-[16px]">
          {notFound && <p className="text-red-400 text-xs px-1">⚠ Barcode not in this job card</p>}
          {lastItem && <p className="text-emerald-400 text-xs px-1">✓ {lastItem.rawMaterial.name} · {counts[lastItem.id]}/{lastItem.quantityReq} {lastItem.rawMaterial.unit}</p>}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {card.items.map(item => {
          const need    = item.quantityReq;
          const scanned = counts[item.id] ?? 0;
          const done    = scanned >= need;
          const partial = scanned > 0 && !done;
          const active  = lastScanned === item.id;
          const stockOk = item.rawMaterial.currentStock >= need;

          return (
            <div key={item.id} className="rounded-2xl px-4 py-3 transition-all"
              style={{
                background: done ? 'rgba(34,197,94,0.07)' : active ? 'rgba(14,165,233,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${done ? 'rgba(34,197,94,0.35)' : active ? 'rgba(14,165,233,0.5)' : item.isCritical ? 'rgba(251,113,133,0.2)' : 'rgba(255,255,255,0.06)'}`,
              }}>
              {/* Name row */}
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-zinc-600 font-mono text-[10px] shrink-0">{item.rawMaterial.barcode ?? item.rawMaterial.code}</span>
                <span className="text-zinc-100 text-sm flex-1 font-medium leading-tight">{item.rawMaterial.name}</span>
                {item.isCritical && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0" style={{ background: 'rgba(251,113,133,0.15)', color: '#fb7185' }}>★ CRITICAL</span>}
                {done && <span className="text-emerald-400 text-xl shrink-0">✓</span>}
              </div>

              {/* Progress + count */}
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded-lg shrink-0 ${done ? 'text-emerald-400 bg-emerald-900/30' : partial ? 'text-amber-300 bg-amber-900/20' : 'text-zinc-500 bg-zinc-800'}`}>
                  {scanned}/{fmt(need)} <span className="font-normal opacity-60">{item.rawMaterial.unit}</span>
                </span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: need > 0 ? `${Math.min((scanned / need) * 100, 100)}%` : '0%',
                      background: done ? '#4ade80' : partial ? '#fbbf24' : 'rgba(56,189,248,0.4)',
                      minWidth: scanned > 0 ? '6px' : '0px',
                    }} />
                </div>
              </div>

              {!stockOk && <p className="text-[10px] text-amber-400 mt-1.5">⚠ Only {fmt(item.rawMaterial.currentStock)} in stock</p>}
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
      <div className="px-4 py-4 border-t border-zinc-800 flex items-center gap-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom),16px)' }}>
        <div className="flex-1">
          <span className={`text-xs px-3 py-1.5 rounded-lg font-semibold ${allDone ? 'text-emerald-400 bg-emerald-900/25' : anyScanned ? 'text-amber-400 bg-amber-900/20' : 'text-zinc-600 bg-zinc-800'}`}>
            {allDone ? '✓ Full Dispatch' : anyScanned ? `Partial · ${doneCount}/${card.items.length} done` : 'Scan to begin'}
          </span>
          {criticalShort.length > 0 && <p className="text-red-400 text-[10px] mt-1">⛔ {criticalShort.length} critical item{criticalShort.length > 1 ? 's' : ''} incomplete</p>}
        </div>
        <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-zinc-400 border border-zinc-700">Cancel</button>
        <button onClick={handleDispatch}
          disabled={submitting || !anyScanned || criticalShort.length > 0}
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
          style={{ background: criticalShort.length > 0 ? 'rgba(239,68,68,0.5)' : allDone ? '#16a34a' : '#d97706' }}>
          {submitting ? 'Dispatching…' : 'Dispatch'}
        </button>
      </div>
    </div>
  );
}

// ── Verify Modal (Employee scans received materials) ──────────────────────────
function VerifyModal({ card, onClose, onDone }: { card: JobCard; onClose: () => void; onDone: () => void }) {
  const [scanVal, setScanVal]         = useState('');
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [notFound, setNotFound]       = useState(false);
  const [verified, setVerified]       = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    card.items.forEach(i => { m[i.id] = i.isVerified; });
    return m;
  });
  const [submitting, setSubmitting]   = useState(false);
  const [damagingItem, setDamagingItem] = useState<JobCardItem | null>(null);
  const [error, setError]             = useState('');

  async function processScan(raw: string) {
    const val = raw.trim().toUpperCase();
    const found = card.items.find(i =>
      i.rawMaterial.barcode?.toUpperCase() === val || i.rawMaterial.code.toUpperCase() === val
    );
    if (!found) { setNotFound(true); setLastScanned(null); setTimeout(() => setNotFound(false), 1500); return; }
    if (verified[found.id]) return; // already verified
    setNotFound(false); setLastScanned(found.id);
    setTimeout(() => setLastScanned(null), 1200);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/job-cards/${card.id}/verify-item`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: found.id, verifiedQty: found.quantityIssued }),
      });
      if (res.ok) {
        const updated = await res.json();
        setVerified(prev => ({ ...prev, [found.id]: true }));
        if (updated.status === 'IN_PROGRESS') onDone();
      } else { setError('Verification failed'); }
    } finally { setSubmitting(false); }
  }

  const doneCount = Object.values(verified).filter(Boolean).length;
  const lastItem  = lastScanned ? card.items.find(i => i.id === lastScanned) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0f0f0f' }}>
      <div className="flex items-center justify-between px-4 border-b border-zinc-800/60"
        style={{ paddingTop: 'max(env(safe-area-inset-top),16px)', paddingBottom: 12 }}>
        <div>
          <p className="text-white font-bold text-base">{card.cardNumber}</p>
          <p className="text-zinc-500 text-xs">Verify received materials · {card.order.orderNumber}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center"><p className="text-white font-bold text-lg leading-none">{doneCount}</p><p className="text-zinc-600 text-[10px]">of {card.items.length}</p></div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white" style={{ background: 'rgba(255,255,255,0.08)' }}>✕</button>
        </div>
      </div>
      <div className="px-4 py-3 border-b border-zinc-800/40">
        <div className="flex items-center gap-2 px-3 py-3 rounded-2xl transition-all"
          style={{ background: notFound ? 'rgba(239,68,68,0.08)' : lastScanned ? 'rgba(34,197,94,0.08)' : 'rgba(14,165,233,0.06)', border: `1.5px solid ${notFound ? 'rgba(239,68,68,0.5)' : lastScanned ? 'rgba(34,197,94,0.5)' : 'rgba(14,165,233,0.25)'}` }}>
          <span className="text-xl shrink-0">{notFound ? '❌' : lastScanned ? '✅' : '📦'}</span>
          <ScanInput value={scanVal} onChange={setScanVal} onScan={processScan} placeholder="Scan component barcode to verify…" autoFocus disabled={submitting} scannerTitle="Verify Component" scannerHint="Scan each component to confirm receipt" />
        </div>
        <div className="mt-1.5 min-h-[16px]">
          {notFound && <p className="text-red-400 text-xs px-1">⚠ Barcode not in this job card</p>}
          {lastItem  && <p className="text-emerald-400 text-xs px-1">✓ {lastItem.rawMaterial.name} verified</p>}
          {error     && <p className="text-red-400 text-xs px-1">⚠ {error}</p>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {card.items.map(item => {
          const isVer = verified[item.id];
          const active = lastScanned === item.id;
          return (
            <div key={item.id} className="rounded-2xl px-4 py-3 flex items-center gap-3 transition-all"
              style={{ background: isVer ? 'rgba(34,197,94,0.07)' : active ? 'rgba(14,165,233,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${isVer ? 'rgba(34,197,94,0.35)' : active ? 'rgba(14,165,233,0.5)' : item.isCritical ? 'rgba(251,113,133,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${isVer ? 'bg-emerald-500' : 'bg-zinc-700'}`}>
                {isVer && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-zinc-100 text-sm font-medium truncate">{item.rawMaterial.name}</p>
                <p className="text-zinc-600 font-mono text-[10px]">{item.rawMaterial.barcode ?? item.rawMaterial.code}</p>
              </div>
              {item.isCritical && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0" style={{ background: 'rgba(251,113,133,0.15)', color: '#fb7185' }}>★</span>}
              <span className="text-sm font-mono text-zinc-400 shrink-0">{fmt(item.quantityIssued)} {item.rawMaterial.unit}</span>
              <button onClick={() => setDamagingItem(item)}
                className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-red-800/50 text-red-400 hover:bg-red-900/30">
                ⚠
              </button>
            </div>
          );
        })}
      </div>
      {damagingItem && (
        <DamageReportModal item={damagingItem} jobCard={card} onClose={() => setDamagingItem(null)} />
      )}
      <div className="px-4 py-4 border-t border-zinc-800 text-center text-zinc-500 text-xs" style={{ paddingBottom: 'max(env(safe-area-inset-bottom),16px)' }}>
        {doneCount < card.items.length ? `Scan all ${card.items.length} items to start work` : '✅ All items verified — job card moved to In Progress'}
      </div>
    </div>
  );
}

// ── Damage Report Modal ────────────────────────────────────────────────────────
const DAMAGE_REASONS = [
  { value: 'broken_on_arrival', label: 'Broken on arrival' },
  { value: 'assembly_damage', label: 'Damaged during assembly' },
  { value: 'wrong_spec', label: 'Wrong specification' },
  { value: 'other', label: 'Other' },
];

function DamageReportModal({ item, jobCard, onClose }: {
  item: JobCardItem; jobCard: JobCard; onClose: () => void;
}) {
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('broken_on_arrival');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    const qtyNum = parseFloat(qty);
    if (!qtyNum || qtyNum <= 0) return alert('Enter a valid quantity');
    setSaving(true);
    const r = await fetch('/api/inventory/damage-reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobCardId: jobCard.id,
        rawMaterialId: item.rawMaterialId,
        batchId: item.batch?.id ?? undefined,
        stage: jobCard.stage,
        qtyDamaged: qtyNum,
        reason, notes: notes.trim() || undefined,
      }),
    });
    setSaving(false);
    if (r.ok) { onClose(); }
    else { const e = await r.json(); alert(e.error); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="w-full max-w-lg rounded-t-2xl p-5 space-y-4" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-red-900/40 flex items-center justify-center text-lg">⚠️</div>
          <div>
            <p className="text-white font-semibold text-sm">Report Damage</p>
            <p className="text-zinc-500 text-xs">{item.rawMaterial.name}{item.batch ? ` · ${item.batch.batchCode}` : ''}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-zinc-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500">
              {DAMAGE_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Qty Damaged ({item.rawMaterial.unit})</label>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)} min="0.01" step="any"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Notes (optional)</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. capacitor cracked on leg"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-red-500" />
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-red-700 hover:bg-red-600 text-white disabled:opacity-50">
            {saving ? 'Submitting...' : 'Submit Damage Report'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm bg-zinc-700 hover:bg-zinc-600 text-white">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Complete Modal ────────────────────────────────────────────────────────────
function CompleteModal({ card, onClose, onDone }: { card: JobCard; onClose: () => void; onDone: () => void }) {
  const [notes, setNotes]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  async function handleComplete() {
    setSubmitting(true); setError('');
    const res = await fetch(`/api/inventory/job-cards/${card.id}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notes || undefined }),
    });
    setSubmitting(false);
    if (res.ok) { onDone(); } else { const d = await res.json(); setError(d.error || 'Failed'); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-t-2xl p-6 space-y-4" style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-900/40 flex items-center justify-center text-xl">✅</div>
          <div>
            <p className="text-white font-semibold">Complete Job Card</p>
            <p className="text-zinc-500 text-xs">{card.cardNumber} · {card.order.orderNumber}</p>
          </div>
        </div>
        <p className="text-zinc-400 text-sm">Mark this job card as completed. This confirms manufacturing work for this stage is done.</p>
        <div>
          <label className="text-zinc-500 text-xs mb-1 block">Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any notes about the completion…"
            className="w-full rounded-xl px-3 py-2 text-sm text-white resize-none outline-none"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>
        {error && <p className="text-red-400 text-xs">⚠ {error}</p>}
        <div className="flex gap-3 pb-safe" style={{ paddingBottom: 'max(env(safe-area-inset-bottom),0px)' }}>
          <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm text-zinc-400 border border-zinc-700">Cancel</button>
          <button onClick={handleComplete} disabled={submitting} className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: '#16a34a' }}>
            {submitting ? 'Completing…' : 'Mark Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Return Modal ──────────────────────────────────────────────────────────────
function ReturnModal({ card, onClose, onDone }: { card: JobCard; onClose: () => void; onDone: () => void }) {
  const returnableItems = card.items.filter(i => i.quantityIssued > i.returnedQty);
  const [qtys, setQtys]           = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    returnableItems.forEach(i => { m[i.id] = '0'; });
    return m;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  async function handleReturn() {
    const items = returnableItems
      .map(i => ({ jobCardItemId: i.id, returnQty: parseFloat(qtys[i.id] ?? '0') || 0 }))
      .filter(i => i.returnQty > 0);
    if (items.length === 0) { setError('Enter at least one return qty'); return; }
    setSubmitting(true); setError('');
    const res = await fetch(`/api/inventory/job-cards/${card.id}/return`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    setSubmitting(false);
    if (res.ok) { onDone(); } else { const d = await res.json(); setError(d.error || 'Return failed'); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0f0f0f' }}>
      <div className="flex items-center justify-between px-4 border-b border-zinc-800" style={{ paddingTop: 'max(env(safe-area-inset-top),16px)', paddingBottom: 12 }}>
        <div>
          <p className="text-white font-bold">Return Materials</p>
          <p className="text-zinc-500 text-xs">{card.cardNumber} · {card.order.orderNumber}</p>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white" style={{ background: 'rgba(255,255,255,0.08)' }}>✕</button>
      </div>
      <p className="px-4 py-3 text-zinc-500 text-xs border-b border-zinc-800/50">Enter qty to return for unused materials. Stock will be added back.</p>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {returnableItems.length === 0 ? (
          <p className="text-center text-zinc-600 py-10">No returnable materials</p>
        ) : returnableItems.map(item => {
          const max = item.quantityIssued - item.returnedQty;
          return (
            <div key={item.id} className="rounded-2xl px-4 py-3 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex-1 min-w-0">
                <p className="text-zinc-100 text-sm font-medium truncate">{item.rawMaterial.name}</p>
                <p className="text-zinc-600 text-[10px]">Issued: {fmt(item.quantityIssued)} · Returnable: {fmt(max)} {item.rawMaterial.unit}</p>
              </div>
              <input type="number" min="0" max={max} step="any"
                value={qtys[item.id] ?? '0'}
                onChange={e => setQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                onWheel={e => (e.target as HTMLInputElement).blur()}
                className="w-20 text-center text-sm font-mono text-white rounded-xl px-2 py-2 outline-none"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                placeholder="0" />
              <span className="text-zinc-500 text-xs shrink-0">{item.rawMaterial.unit}</span>
            </div>
          );
        })}
      </div>
      {error && <div className="px-4 py-2 border-t border-red-900/30"><p className="text-red-400 text-xs">⚠ {error}</p></div>}
      <div className="px-4 py-4 border-t border-zinc-800 flex gap-3" style={{ paddingBottom: 'max(env(safe-area-inset-bottom),16px)' }}>
        <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm text-zinc-400 border border-zinc-700">Cancel</button>
        <button onClick={handleReturn} disabled={submitting || returnableItems.length === 0}
          className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-50"
          style={{ background: 'rgba(251,191,36,0.85)' }}>
          {submitting ? 'Returning…' : 'Return to Store'}
        </button>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export default function JobCardsPanel({ sessionRole }: { sessionRole: string }) {
  const [tab,         setTab]         = useState<'pending' | 'dispatched' | 'in_progress' | 'completed'>('pending');
  const [cards,       setCards]       = useState<JobCard[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<JobCard | null>(null);
  const [verifying,   setVerifying]   = useState<JobCard | null>(null);
  const [completing,  setCompleting]  = useState<JobCard | null>(null);
  const [returning,   setReturning]   = useState<JobCard | null>(null);

  const canDispatch = ['INVENTORY_MANAGER', 'STORE_MANAGER', 'ADMIN'].includes(sessionRole);
  const isEmployee  = sessionRole === 'PRODUCTION_EMPLOYEE';

  const load = useCallback(async () => {
    setLoading(true);
    const statusMap: Record<string, string> = { pending: 'PENDING', dispatched: 'DISPATCHED', in_progress: 'IN_PROGRESS', completed: 'COMPLETED' };
    const res = await fetch(`/api/inventory/job-cards?status=${statusMap[tab]}`);
    if (res.ok) setCards(await res.json());
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'pending',     label: 'Pending' },
    { key: 'dispatched',  label: 'Dispatched' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed',   label: 'Completed' },
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

                    <div className="flex gap-2 shrink-0 items-center flex-wrap justify-end">
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
                      {/* Dispatch — Inventory Manager / Store Manager / Admin */}
                      {canDispatch && card.status === 'PENDING' && (
                        <button onClick={() => setDispatching(card)}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all"
                          style={{ background: 'rgba(34,197,94,0.8)' }}>
                          Dispatch
                        </button>
                      )}
                      {/* Verify Items — shown to employee/PM/admin on DISPATCHED cards */}
                      {card.status === 'DISPATCHED' && (
                        <button onClick={() => setVerifying(card)}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all"
                          style={{ background: 'rgba(14,165,233,0.8)' }}>
                          Verify
                        </button>
                      )}
                      {/* Return Materials — on DISPATCHED, IN_PROGRESS, COMPLETED */}
                      {['DISPATCHED', 'IN_PROGRESS', 'COMPLETED'].includes(card.status) && (
                        <button onClick={() => setReturning(card)}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold transition-all"
                          style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                          Return
                        </button>
                      )}
                      {/* Complete — on DISPATCHED or IN_PROGRESS */}
                      {['DISPATCHED', 'IN_PROGRESS'].includes(card.status) && (
                        <button onClick={() => setCompleting(card)}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all"
                          style={{ background: 'rgba(168,85,247,0.8)' }}>
                          Complete
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
                          {item.isVerified && (
                            <span className="text-sky-400 text-[10px] shrink-0">👁</span>
                          )}
                          {item.returnedQty > 0 && (
                            <span className="text-amber-400 text-[10px] shrink-0">↩{fmt(item.returnedQty)}</span>
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

      {/* Verify Modal */}
      {verifying && (
        <VerifyModal
          card={verifying}
          onClose={() => setVerifying(null)}
          onDone={() => { setVerifying(null); load(); }}
        />
      )}

      {/* Complete Modal */}
      {completing && (
        <CompleteModal
          card={completing}
          onClose={() => setCompleting(null)}
          onDone={() => { setCompleting(null); load(); }}
        />
      )}

      {/* Return Modal */}
      {returning && (
        <ReturnModal
          card={returning}
          onClose={() => setReturning(null)}
          onDone={() => { setReturning(null); load(); }}
        />
      )}
    </div>
  );
}
