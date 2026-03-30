'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

type ClientOption  = { id: string; code: string; customerName: string };
type ProductOption = { id: string; code: string; name: string };

type LookupResult = {
  unitId:            string;
  orderId:           string | null;
  serialNumber:      string;
  orderNumber:       string | null;
  client:            { id: string; code: string; customerName: string } | null;
  product:           { id: string; code: string; name: string } | null;
  dispatchedAt:      string | null;
  warrantyDays:      number;
  warrantyExpiry:    string | null;
  daysSinceDispatch: number | null;
  warrantyStatus:    'in_warranty' | 'out_of_warranty' | 'unknown';
};

type LookupState = LookupResult | 'not_found' | null;

type UnitEntry = {
  serial:        string;
  lookupState:   LookupState;
  lookupLoading: boolean;
  lookupError:   string;
};

const TYPE_OPTIONS = [
  { value: 'WARRANTY',   label: 'Warranty'   },
  { value: 'DAMAGE',     label: 'Damage'     },
  { value: 'WRONG_ITEM', label: 'Wrong Item' },
  { value: 'OTHER',      label: 'Other'      },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ReturnForm({ clients, products }: { clients: ClientOption[]; products: ProductOption[] }) {
  const router = useRouter();

  const [useManual, setUseManual] = useState(false);
  const [qty,       setQty]       = useState(1);

  // Serial mode — one entry per unit
  const [units, setUnits] = useState<UnitEntry[]>([
    { serial: '', lookupState: null, lookupLoading: false, lookupError: '' },
  ]);
  const timers = useRef<(ReturnType<typeof setTimeout> | null)[]>([null]);

  // Manual mode — shared client + product, one serial per unit
  const [clientId,       setClientId]       = useState('');
  const [productId,      setProductId]       = useState('');
  const [manualSerials,  setManualSerials]   = useState<string[]>(['']);

  // Common
  const [type,          setType]          = useState('WARRANTY');
  const [reportedIssue, setReportedIssue] = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  // ── Qty change ────────────────────────────────────────────────────────────
  function changeQty(n: number) {
    const clamped = Math.max(1, Math.min(20, n));
    setQty(clamped);

    // Adjust serial units array
    setUnits(prev => {
      const next = [...prev];
      while (next.length < clamped) next.push({ serial: '', lookupState: null, lookupLoading: false, lookupError: '' });
      return next.slice(0, clamped);
    });
    timers.current = Array(clamped).fill(null);

    // Adjust manual serials
    setManualSerials(prev => {
      const next = [...prev];
      while (next.length < clamped) next.push('');
      return next.slice(0, clamped);
    });
  }

  // ── Serial lookup (serial mode) ────────────────────────────────────────────
  function updateUnit(idx: number, patch: Partial<UnitEntry>) {
    setUnits(prev => prev.map((u, i) => i === idx ? { ...u, ...patch } : u));
  }

  async function doLookup(idx: number, serial: string) {
    const trimmed = serial.trim().toUpperCase();
    updateUnit(idx, { lookupState: null, lookupError: '', lookupLoading: true });

    try {
      const res = await fetch(`/api/units/serial-lookup?serial=${encodeURIComponent(trimmed)}`);
      if (res.status === 404) {
        updateUnit(idx, { lookupState: 'not_found', lookupLoading: false });
        return;
      }
      if (!res.ok) {
        updateUnit(idx, { lookupError: 'Lookup failed', lookupLoading: false });
        return;
      }
      const data = await res.json() as LookupResult;
      updateUnit(idx, { lookupState: data, lookupLoading: false });
    } catch {
      updateUnit(idx, { lookupError: 'Network error', lookupLoading: false });
    }
  }

  function onSerialChange(idx: number, val: string) {
    updateUnit(idx, { serial: val, lookupState: null, lookupError: '' });
    if (timers.current[idx]) clearTimeout(timers.current[idx]!);
    if (val.trim()) {
      timers.current[idx] = setTimeout(() => doLookup(idx, val), 600);
    }
  }

  function onSerialBlur(idx: number) {
    const u = units[idx];
    if (timers.current[idx]) clearTimeout(timers.current[idx]!);
    if (u.serial.trim() && !u.lookupState && !u.lookupLoading) {
      doLookup(idx, u.serial);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!reportedIssue.trim()) { setError('Please describe the reported issue.'); return; }

    if (!useManual) {
      // Validate all units looked up + none out of warranty
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!u.serial.trim()) { setError(`Please enter serial number for unit ${i + 1}.`); return; }
        if (!u.lookupState)   { setError(`Please look up serial number for unit ${i + 1}.`); return; }
        if (u.lookupState === 'not_found') {
          // Allowed — serial stored as-is, but no client resolution; need to handle below
        } else {
          const lu = u.lookupState as LookupResult;
          if (lu.warrantyStatus === 'out_of_warranty') {
            setError(`Unit ${i + 1} (${u.serial}) is out of warranty — ${lu.daysSinceDispatch} days old (limit: ${lu.warrantyDays} days).`);
            return;
          }
          if (!lu.client) {
            setError(`Unit ${i + 1}: could not resolve client. Use Manual Entry instead.`);
            return;
          }
        }
      }
      // Check if any not_found units have no way to resolve client
      const hasNotFound = units.some(u => u.lookupState === 'not_found');
      if (hasNotFound) {
        setError('One or more serials were not found. Switch to Manual Entry for older units.');
        return;
      }
    } else {
      if (!clientId)  { setError('Please select a client.'); return; }
      if (!productId) { setError('Please select a product model.'); return; }
      for (let i = 0; i < manualSerials.length; i++) {
        if (!manualSerials[i].trim()) { setError(`Please enter serial number for unit ${i + 1}.`); return; }
      }
    }

    setLoading(true);
    try {
      const submits = useManual
        ? manualSerials.map(s => ({
            clientId,
            serialNumber: s.trim().toUpperCase(),
            productId: productId || undefined,
            type,
            reportedIssue: reportedIssue.trim(),
          }))
        : units.map(u => {
            const lu = u.lookupState as LookupResult;
            return {
              serialNumber: u.serial.trim().toUpperCase(),
              clientId:     lu.client?.id,
              type,
              reportedIssue: reportedIssue.trim(),
            };
          });

      for (const body of submits) {
        const res = await fetch('/api/returns', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json() as { error?: string };
          throw new Error(d.error ?? 'Failed to create return request.');
        }
      }

      router.push('/sales?tab=returns');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  const anyOutOfWarranty = !useManual && units.some(
    u => u.lookupState && u.lookupState !== 'not_found' && (u.lookupState as LookupResult).warrantyStatus === 'out_of_warranty'
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Mode toggle */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <button type="button" onClick={() => { setUseManual(false); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${!useManual ? 'bg-sky-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
          By Serial Number
        </button>
        <button type="button" onClick={() => { setUseManual(true); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${useManual ? 'bg-sky-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
          Manual Entry
        </button>
      </div>

      {/* Quantity */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          No. of Units <span className="text-red-400">*</span>
        </label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => changeQty(qty - 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #27272a' }}>
            −
          </button>
          <input
            type="number" min={1} max={20}
            value={qty}
            onChange={e => changeQty(parseInt(e.target.value) || 1)}
            onWheel={e => e.currentTarget.blur()}
            className="w-16 text-center bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
          />
          <button type="button" onClick={() => changeQty(qty + 1)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-bold text-white transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #27272a' }}>
            +
          </button>
          <span className="text-xs text-zinc-500">unit{qty !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* ── Serial number mode ── */}
      {!useManual && (
        <div className="space-y-4">
          {units.map((u, idx) => {
            const lu = u.lookupState && u.lookupState !== 'not_found' ? u.lookupState as LookupResult : null;
            const isOut = lu?.warrantyStatus === 'out_of_warranty';
            const isIn  = lu?.warrantyStatus === 'in_warranty';

            return (
              <div key={idx} className="space-y-2">
                <label className="block text-xs font-medium text-zinc-400">
                  Unit {idx + 1} — Serial Number <span className="text-red-400">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={u.serial}
                    onChange={e => onSerialChange(idx, e.target.value)}
                    onBlur={() => onSerialBlur(idx)}
                    placeholder="e.g. SMX100026001"
                    className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-sky-500"
                  />
                  <button type="button" onClick={() => doLookup(idx, u.serial)} disabled={u.lookupLoading || !u.serial.trim()}
                    className="px-3 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-40 transition-colors shrink-0"
                    style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}>
                    {u.lookupLoading ? '…' : 'Look Up'}
                  </button>
                </div>

                {u.lookupError && (
                  <p className="text-xs text-red-400 px-1">{u.lookupError}</p>
                )}

                {u.lookupState === 'not_found' && (
                  <div className="rounded-xl px-3 py-2.5 text-xs text-amber-300" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
                    Serial not found in system — recorded as-is, no warranty check possible.
                  </div>
                )}

                {lu && (
                  <div className="rounded-xl p-3 space-y-2" style={{
                    background: isOut ? 'rgba(239,68,68,0.06)'  : 'rgba(34,197,94,0.06)',
                    border:     isOut ? '1px solid rgba(239,68,68,0.25)'  : '1px solid rgba(34,197,94,0.2)',
                  }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: isOut ? '#f87171' : '#4ade80' }}>
                        {isOut ? 'Out of Warranty' : 'Unit found'}
                      </span>
                      {lu.product && <span className="text-[10px] text-zinc-400">— {lu.product.name}</span>}
                      {lu.orderNumber && <span className="text-[10px] text-zinc-500 font-mono">{lu.orderNumber}</span>}
                    </div>

                    {lu.dispatchedAt && (
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-zinc-500">Dispatched:</span>
                        <span className="text-white">{fmtDate(lu.dispatchedAt)}</span>
                        <span className="text-zinc-500">({lu.daysSinceDispatch}d ago)</span>
                        <span style={{ color: isOut ? '#f87171' : isIn ? '#4ade80' : '#a1a1aa' }}>
                          {lu.warrantyDays}d warranty
                          {isOut && ' — EXPIRED'}
                          {isIn && lu.warrantyExpiry && ` — valid until ${fmtDate(lu.warrantyExpiry)}`}
                        </span>
                      </div>
                    )}

                    {lu.warrantyStatus === 'unknown' && (
                      <p className="text-[10px] text-zinc-500">No dispatch date — warranty cannot be verified</p>
                    )}

                    {isOut && (
                      <p className="text-xs text-red-400 font-medium">
                        {lu.daysSinceDispatch} days since dispatch — exceeds {lu.warrantyDays}-day warranty. This unit will be rejected.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Manual entry mode ── */}
      {useManual && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Client <span className="text-red-400">*</span>
            </label>
            <select value={clientId} onChange={e => setClientId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500">
              <option value="">Select client…</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.customerName} ({c.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Product Model <span className="text-red-400">*</span>
            </label>
            <select value={productId} onChange={e => setProductId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500">
              <option value="">Select model…</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* One serial per unit */}
          <div className="space-y-3">
            {manualSerials.map((s, idx) => (
              <div key={idx}>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Unit {idx + 1} — Serial Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={s}
                  onChange={e => setManualSerials(prev => prev.map((v, i) => i === idx ? e.target.value : v))}
                  placeholder="Enter serial number"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-sky-500"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Return Type */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Return Type <span className="text-red-400">*</span>
        </label>
        <select value={type} onChange={e => setType(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500">
          {TYPE_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Reported Issue */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Reported Issue <span className="text-red-400">*</span>
        </label>
        <textarea
          value={reportedIssue}
          onChange={e => setReportedIssue(e.target.value)}
          rows={4}
          placeholder="Describe the issue reported by the customer…"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-sky-500"
        />
      </div>

      {anyOutOfWarranty && (
        <div className="rounded-xl px-3 py-2.5 text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          One or more units are out of warranty. Please remove them before submitting.
        </div>
      )}

      {error && (
        <div className="rounded-xl px-3 py-2.5 text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={loading || anyOutOfWarranty}
          className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 text-white transition-colors"
          style={{ background: anyOutOfWarranty ? '#71717a' : '#0284c7' }}
        >
          {loading
            ? `Submitting ${qty} unit${qty > 1 ? 's' : ''}…`
            : anyOutOfWarranty
            ? 'Out of Warranty — Cannot Submit'
            : qty > 1 ? `Submit ${qty} Replacement Requests` : 'Submit Replacement'}
        </button>
        <button type="button" onClick={() => router.back()} disabled={loading}
          className="px-5 py-3 rounded-xl text-sm text-zinc-400 disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
