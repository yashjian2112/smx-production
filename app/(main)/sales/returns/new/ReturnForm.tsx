'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ClientOption = { id: string; code: string; customerName: string };

type LookupResult = {
  unitId:       string;
  orderId:      string | null;
  serialNumber: string;
  orderNumber:  string | null;
  client:  { id: string; code: string; customerName: string } | null;
  product: { id: string; code: string; name: string } | null;
};

// Three lookup states:
//   null        = not yet looked up
//   LookupResult = found in system
//   'not_found' = serial typed but not in DB (pre-system unit)
type LookupState = LookupResult | 'not_found' | null;

const TYPE_OPTIONS = [
  { value: 'WARRANTY',   label: 'Warranty'   },
  { value: 'DAMAGE',     label: 'Damage'     },
  { value: 'WRONG_ITEM', label: 'Wrong Item' },
  { value: 'OTHER',      label: 'Other'      },
];

export default function ReturnForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();

  const [useManual,     setUseManual]     = useState(false);

  // Serial mode
  const [serialInput,   setSerialInput]   = useState('');
  const [lookupState,   setLookupState]   = useState<LookupState>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError,   setLookupError]   = useState('');

  // For "not found" inline fallback — pick client manually, serial still stored
  const [fallbackClientId, setFallbackClientId] = useState('');

  // Manual mode
  const [clientId,      setClientId]      = useState('');
  const [manualSerial,  setManualSerial]  = useState('');

  // Common
  const [type,          setType]          = useState('WARRANTY');
  const [reportedIssue, setReportedIssue] = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  function resetLookup() {
    setLookupState(null);
    setLookupError('');
    setFallbackClientId('');
  }

  // ── Lookup ───────────────────────────────────────────────────────────────
  async function lookupSerial() {
    const serial = serialInput.trim();
    if (!serial) { setLookupError('Enter a serial number first.'); return; }

    resetLookup();
    setLookupLoading(true);

    try {
      const res = await fetch(`/api/units/serial-lookup?serial=${encodeURIComponent(serial)}`);

      if (res.status === 404) {
        // Not in system — pre-system unit; allow fallback
        setLookupState('not_found');
        return;
      }
      if (!res.ok) {
        setLookupError('Lookup failed. Please try again.');
        return;
      }

      const data = await res.json() as LookupResult;
      setLookupState(data);
    } catch {
      setLookupError('Network error. Please try again.');
    } finally {
      setLookupLoading(false);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!useManual) {
      const serial = serialInput.trim();
      if (!serial) { setError('Please enter a serial number.'); return; }

      if (lookupState === null) {
        setError('Please press Look Up before submitting.'); return;
      }

      if (lookupState === 'not_found') {
        if (!fallbackClientId) { setError('Unit not found in system — please select the client manually.'); return; }
      }
      // lookupResult.client could be null in rare cases
      if (lookupState !== 'not_found' && lookupState !== null && !lookupState.client) {
        setError('Could not resolve client for this unit. Use Manual Entry instead.'); return;
      }
    } else {
      if (!clientId) { setError('Please select a client.'); return; }
    }

    if (!reportedIssue.trim()) { setError('Please describe the reported issue.'); return; }

    setLoading(true);
    try {
      let body: Record<string, unknown>;

      if (useManual) {
        body = {
          clientId,
          serialNumber: manualSerial.trim() || undefined,
          type,
          reportedIssue: reportedIssue.trim(),
        };
      } else if (lookupState === 'not_found') {
        // Pre-system unit: save serial + chosen client (no unit/order link)
        body = { serialNumber: serialInput.trim(), clientId: fallbackClientId, type, reportedIssue: reportedIssue.trim() };
      } else {
        // Found in system: serial auto-resolves client server-side
        body = { serialNumber: serialInput.trim(), type, reportedIssue: reportedIssue.trim() };
      }

      const res  = await fetch('/api/returns', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to create return request.'); return; }

      router.push('/sales?tab=returns');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const foundInSystem = lookupState !== null && lookupState !== 'not_found';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Mode toggle */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <button
          type="button"
          onClick={() => { setUseManual(false); resetLookup(); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${!useManual ? 'bg-sky-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          By Serial Number
        </button>
        <button
          type="button"
          onClick={() => { setUseManual(true); resetLookup(); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${useManual ? 'bg-sky-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Manual Entry
        </button>
      </div>

      {/* ── Serial number mode ── */}
      {!useManual && (
        <div className="space-y-3">
          {/* Input + Look Up */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Serial Number <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serialInput}
                onChange={(e) => { setSerialInput(e.target.value); resetLookup(); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookupSerial(); } }}
                placeholder="e.g. SMX100026001"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={lookupSerial}
                disabled={lookupLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors shrink-0"
                style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}
              >
                {lookupLoading ? 'Looking…' : 'Look Up'}
              </button>
            </div>
            <p className="text-xs text-zinc-600 mt-1">Scan or type the unit serial number, then press Look Up</p>
          </div>

          {/* Generic lookup error */}
          {lookupError && (
            <div className="rounded-xl px-3 py-2.5 text-xs text-red-300" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {lookupError}
            </div>
          )}

          {/* ✅ Found in system */}
          {foundInSystem && (
            <div className="rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <div className="flex items-center gap-2 mb-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs font-semibold text-green-400">Unit found in system</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-zinc-500">Serial</span>
                <span className="text-white font-mono">{(lookupState as LookupResult).serialNumber}</span>

                {(lookupState as LookupResult).client && (
                  <>
                    <span className="text-zinc-500">Client</span>
                    <span className="text-white">{(lookupState as LookupResult).client!.customerName}</span>
                  </>
                )}

                {(lookupState as LookupResult).product && (
                  <>
                    <span className="text-zinc-500">Product</span>
                    <span className="text-white">{(lookupState as LookupResult).product!.name}</span>
                  </>
                )}

                {(lookupState as LookupResult).orderNumber && (
                  <>
                    <span className="text-zinc-500">Order</span>
                    <span className="text-white font-mono">{(lookupState as LookupResult).orderNumber}</span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ⚠️ Not found — pre-system / old unit */}
          {lookupState === 'not_found' && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)' }}>
              <div className="flex items-start gap-2">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth={2} className="mt-0.5 shrink-0">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div>
                  <p className="text-xs font-semibold text-amber-400">Serial not found in system</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    This unit was likely sold before the tracking system was set up.
                    The serial number will still be recorded — just select the client below.
                  </p>
                </div>
              </div>

              {/* Inline client picker for pre-system units */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Client <span className="text-red-400">*</span>
                </label>
                <select
                  value={fallbackClientId}
                  onChange={(e) => setFallbackClientId(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Select client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.customerName} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Manual entry mode ── */}
      {useManual && (
        <div className="space-y-3">
          {/* Client */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Client <span className="text-red-400">*</span>
            </label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.customerName} ({c.code})
                </option>
              ))}
            </select>
          </div>

          {/* Serial number — optional but recorded for traceability */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Serial Number <span className="text-zinc-600 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={manualSerial}
              onChange={(e) => setManualSerial(e.target.value)}
              placeholder="e.g. SMX100026001"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-sky-500"
            />
            <p className="text-xs text-zinc-600 mt-1">Stored for traceability — won&apos;t be looked up in the system</p>
          </div>
        </div>
      )}

      {/* Return Type */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Return Type <span className="text-red-400">*</span>
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
        >
          {TYPE_OPTIONS.map((opt) => (
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
          onChange={(e) => setReportedIssue(e.target.value)}
          rows={4}
          placeholder="Describe the issue reported by the customer…"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-sky-500"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl px-3 py-2.5 text-sm text-red-300" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-3 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white transition-colors"
        >
          {loading ? 'Submitting…' : 'Submit Return'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="px-5 py-3 rounded-xl text-sm text-zinc-400 disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
