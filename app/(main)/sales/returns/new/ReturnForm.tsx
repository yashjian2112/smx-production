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

const TYPE_OPTIONS = [
  { value: 'WARRANTY',   label: 'Warranty'   },
  { value: 'DAMAGE',     label: 'Damage'     },
  { value: 'WRONG_ITEM', label: 'Wrong Item' },
  { value: 'OTHER',      label: 'Other'      },
];

export default function ReturnForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();

  const [useManual,     setUseManual]     = useState(false);

  // Serial mode state
  const [serialInput,   setSerialInput]   = useState('');
  const [lookupResult,  setLookupResult]  = useState<LookupResult | null>(null);
  const [lookupError,   setLookupError]   = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);

  // Manual mode state
  const [clientId, setClientId] = useState('');

  // Common
  const [type,          setType]          = useState('WARRANTY');
  const [reportedIssue, setReportedIssue] = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  // ── Lookup serial number ──────────────────────────────────────────────────
  async function lookupSerial() {
    const serial = serialInput.trim();
    if (!serial) { setLookupError('Enter a serial number first.'); return; }

    setLookupError('');
    setLookupResult(null);
    setLookupLoading(true);

    try {
      const res = await fetch(`/api/units/serial-lookup?serial=${encodeURIComponent(serial)}`);
      if (res.status === 404) { setLookupError('No unit found with that serial number.'); return; }
      if (!res.ok) { setLookupError('Lookup failed. Please try again.'); return; }
      const data = await res.json() as LookupResult;
      setLookupResult(data);
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
      if (!serialInput.trim()) { setError('Please enter a serial number.'); return; }
      if (!lookupResult)       { setError('Please look up the serial number first.'); return; }
      if (!lookupResult.client){ setError('No client found for this unit. Use manual entry instead.'); return; }
    } else {
      if (!clientId) { setError('Please select a client.'); return; }
    }

    if (!reportedIssue.trim()) { setError('Please describe the reported issue.'); return; }

    setLoading(true);
    try {
      const body = useManual
        ? { clientId, type, reportedIssue: reportedIssue.trim() }
        : { serialNumber: serialInput.trim(), type, reportedIssue: reportedIssue.trim() };

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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Mode toggle */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <button
          type="button"
          onClick={() => { setUseManual(false); setLookupResult(null); setLookupError(''); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${!useManual ? 'bg-sky-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          By Serial Number
        </button>
        <button
          type="button"
          onClick={() => { setUseManual(true); setLookupResult(null); setLookupError(''); }}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${useManual ? 'bg-sky-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Manual Entry
        </button>
      </div>

      {/* ── Serial number mode ── */}
      {!useManual && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Serial Number <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={serialInput}
                onChange={(e) => { setSerialInput(e.target.value); setLookupResult(null); setLookupError(''); }}
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

          {/* Lookup error */}
          {lookupError && (
            <div className="rounded-xl px-3 py-2.5 text-xs text-red-300" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {lookupError}
            </div>
          )}

          {/* Lookup result card */}
          {lookupResult && (
            <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
              <div className="flex items-center gap-2 mb-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs font-semibold text-green-400">Unit found</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-zinc-500">Serial</span>
                <span className="text-white font-mono">{lookupResult.serialNumber}</span>

                {lookupResult.client && (
                  <>
                    <span className="text-zinc-500">Client</span>
                    <span className="text-white">{lookupResult.client.customerName}</span>
                  </>
                )}

                {lookupResult.product && (
                  <>
                    <span className="text-zinc-500">Product</span>
                    <span className="text-white">{lookupResult.product.name}</span>
                  </>
                )}

                {lookupResult.orderNumber && (
                  <>
                    <span className="text-zinc-500">Order</span>
                    <span className="text-white font-mono">{lookupResult.orderNumber}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Manual entry mode ── */}
      {useManual && (
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Client <span className="text-red-400">*</span>
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            required
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
      )}

      {/* Return Type */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Return Type <span className="text-red-400">*</span>
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          required
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
          required
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
