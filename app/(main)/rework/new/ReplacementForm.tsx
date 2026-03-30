'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

type Client  = { id: string; code: string; customerName: string };
type Product = { id: string; code: string; name: string };

type UnitInfo = {
  id: string;
  serialNumber: string;
  currentStage: string;
  product: { name: string; code: string } | null;
  order: { orderNumber: string; client?: { customerName: string; id: string } | null } | null;
};

export default function ReplacementForm({
  clients,
  products,
}: {
  clients:  Client[];
  products: Product[];
}) {
  const router = useRouter();

  const [clientId,     setClientId]     = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [useManual,    setUseManual]    = useState(false);
  const [productId,    setProductId]    = useState('');
  const [voltage,      setVoltage]      = useState('');
  const [issue,        setIssue]        = useState('');
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  // Serial lookup state
  const [lookupLoading, setLookupLoading] = useState(false);
  const [unitInfo,      setUnitInfo]      = useState<UnitInfo | null>(null);
  const [lookupError,   setLookupError]   = useState('');

  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function lookupSerial(val: string) {
    const trimmed = val.trim().toUpperCase();
    setUnitInfo(null);
    setLookupError('');
    if (!trimmed) return;

    setLookupLoading(true);
    try {
      const res = await fetch(`/api/units/by-serial/${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const unit: UnitInfo = await res.json();
        setUnitInfo(unit);
        // Auto-fill client if found in order
        if (unit.order?.client?.id) {
          setClientId(unit.order.client.id);
        }
      } else if (res.status === 404) {
        setLookupError('Serial number not found in system');
      } else {
        setLookupError('Could not fetch unit details');
      }
    } catch {
      setLookupError('Network error looking up serial');
    } finally {
      setLookupLoading(false);
    }
  }

  function onSerialChange(val: string) {
    setSerialNumber(val);
    setUnitInfo(null);
    setLookupError('');
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(() => lookupSerial(val), 600);
  }

  function onSerialBlur() {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (serialNumber.trim() && !unitInfo && !lookupLoading) {
      lookupSerial(serialNumber);
    }
  }

  function switchMode(manual: boolean) {
    setUseManual(manual);
    setUnitInfo(null);
    setLookupError('');
    setSerialNumber('');
    setProductId('');
    setVoltage('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!clientId)             { setError('Please select a client'); return; }
    if (!serialNumber.trim())  { setError('Serial number is required'); return; }
    if (useManual && !productId) { setError('Please select a product model'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/rework/replacement', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          clientId,
          serialNumber: serialNumber.trim().toUpperCase(),
          productId:    useManual ? productId : null,
          voltage:      useManual ? voltage : null,
          issue:        issue.trim(),
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create replacement request');
      }

      router.push('/rework');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">

      {/* Mode toggle */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <button
          type="button"
          onClick={() => switchMode(false)}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${!useManual ? 'bg-sky-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          By Serial Number
        </button>
        <button
          type="button"
          onClick={() => switchMode(true)}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${useManual ? 'bg-sky-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Manual Entry
        </button>
      </div>

      {/* ── Serial Number mode ── */}
      {!useManual && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Serial Number *</label>
            <input
              type="text"
              value={serialNumber}
              onChange={e => onSerialChange(e.target.value)}
              onBlur={onSerialBlur}
              placeholder="e.g. SMX100026001"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-sky-500"
            />
            <p className="text-xs text-zinc-600 mt-1">Scan or type the serial number — unit details will be fetched automatically</p>
          </div>

          {/* Lookup state */}
          {lookupLoading && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}>
              <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
              <span className="text-xs text-sky-400">Looking up serial number…</span>
            </div>
          )}

          {lookupError && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-xs text-red-400">{lookupError}</span>
            </div>
          )}

          {unitInfo && (
            <div className="px-3 py-2.5 rounded-xl space-y-1" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-semibold text-emerald-400">Unit found</span>
              </div>
              {unitInfo.product && (
                <p className="text-xs text-zinc-300"><span className="text-zinc-500">Model:</span> {unitInfo.product.name}</p>
              )}
              {unitInfo.order && (
                <p className="text-xs text-zinc-300"><span className="text-zinc-500">Order:</span> {unitInfo.order.orderNumber}</p>
              )}
              {unitInfo.order?.client && (
                <p className="text-xs text-zinc-300"><span className="text-zinc-500">Client:</span> {unitInfo.order.client.customerName}</p>
              )}
              <p className="text-xs text-zinc-500">
                Stage: {unitInfo.currentStage.replace(/_/g, ' ')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Manual mode ── */}
      {useManual && (
        <div className="space-y-3 rounded-xl border border-zinc-800 p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-xs font-medium text-zinc-400">Older controller not in system</p>

          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Serial Number *</label>
            <input
              type="text"
              value={serialNumber}
              onChange={e => setSerialNumber(e.target.value)}
              placeholder="Enter controller serial number"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Product Model *</label>
            <select
              value={productId}
              onChange={e => setProductId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
            >
              <option value="">Select model…</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Voltage (optional)</label>
            <input
              type="text"
              value={voltage}
              onChange={e => setVoltage(e.target.value)}
              placeholder="e.g. 48V"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>
      )}

      {/* Client */}
      <div>
        <label className="text-xs font-medium text-zinc-400 mb-1.5 block">
          Client *
          {!useManual && unitInfo?.order?.client && (
            <span className="ml-2 text-emerald-500 font-normal">(auto-filled from unit)</span>
          )}
        </label>
        <select
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          required
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
        >
          <option value="">Select client…</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.code} — {c.customerName}</option>
          ))}
        </select>
      </div>

      {/* Issue description */}
      <div>
        <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Issue / Problem *</label>
        <textarea
          value={issue}
          onChange={e => setIssue(e.target.value)}
          rows={4}
          required
          placeholder="Describe the fault or problem with the unit in detail…"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-sky-500"
        />
      </div>

      {error && (
        <div className="rounded-xl p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white transition-colors"
      >
        {saving ? 'Creating…' : 'Create Replacement Request'}
      </button>
    </form>
  );
}
