'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Client  = { id: string; code: string; customerName: string };
type Product = { id: string; code: string; name: string };

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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!clientId)          { setError('Please select a client'); return; }
    if (!issue.trim())      { setError('Please describe the issue'); return; }
    if (!serialNumber.trim()) { setError('Serial number is required'); return; }
    if (useManual && !productId) { setError('Please select a product'); return; }

    setSaving(true);
    try {
      const body = {
        clientId,
        serialNumber: serialNumber.trim(),
        productId:    useManual ? productId : null,
        voltage:      useManual ? voltage : null,
        issue:        issue.trim(),
      };

      const res = await fetch('/api/rework/replacement', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create return request');
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
      {/* Client */}
      <div>
        <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Client *</label>
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

      {/* Toggle: serial vs manual */}
      <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <button
          type="button"
          onClick={() => setUseManual(false)}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${!useManual ? 'bg-sky-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          By Serial Number
        </button>
        <button
          type="button"
          onClick={() => setUseManual(true)}
          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${useManual ? 'bg-sky-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Enter Manually
        </button>
      </div>

      {!useManual ? (
        <div>
          <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Serial Number *</label>
          <input
            type="text"
            value={serialNumber}
            onChange={e => setSerialNumber(e.target.value)}
            placeholder="e.g. SMX100026001"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono placeholder-zinc-600 focus:outline-none focus:border-sky-500"
          />
          <p className="text-xs text-zinc-600 mt-1">Scan or type the unit serial number from the controller</p>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-zinc-800 p-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-xs font-medium text-zinc-400">Product Details (older controller)</p>
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
            <label className="text-xs text-zinc-500 mb-1 block">Product *</label>
            <select
              value={productId}
              onChange={e => setProductId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
            >
              <option value="">Select product…</option>
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
        {saving ? 'Creating…' : 'Create Return Request'}
      </button>
    </form>
  );
}
