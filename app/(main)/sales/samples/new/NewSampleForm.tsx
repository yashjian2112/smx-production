'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type ClientOption  = { id: string; code: string; customerName: string };
type ProductOption = { id: string; code: string; name: string };

export default function NewSampleForm({
  clients,
  products,
}: {
  clients: ClientOption[];
  products: ProductOption[];
}) {
  const router = useRouter();

  const [clientId,     setClientId]     = useState('');
  const [productId,    setProductId]    = useState('');
  const [description,  setDescription]  = useState('');
  const [quantity,     setQuantity]     = useState(1);
  const [notes,        setNotes]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!clientId) { setError('Please select a client.'); return; }
    if (quantity < 1) { setError('Quantity must be at least 1.'); return; }

    setLoading(true);
    try {
      const res = await fetch('/api/samples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          productId:   productId  || undefined,
          description: description || undefined,
          quantity,
          notes:       notes       || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create sample request.');
        return;
      }

      router.push('/sales?tab=samples');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          className="px-3 py-2.5 rounded-xl text-sm"
          style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
        >
          {error}
        </div>
      )}

      {/* Client */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Client <span className="text-red-400">*</span>
        </label>
        <select
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
        >
          <option value="">Select client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.customerName} ({c.code})
            </option>
          ))}
        </select>
      </div>

      {/* Product (optional) */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Product <span className="text-zinc-600">(optional)</span>
        </label>
        <select
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">No specific product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code})
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Description <span className="text-zinc-600">(optional)</span>
        </label>
        <input
          type="text"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500"
          placeholder="Brief description of what's needed…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
        />
      </div>

      {/* Quantity */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Quantity <span className="text-red-400">*</span>
        </label>
        <input
          type="number"
          min={1}
          max={100}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
          value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
          onWheel={(e) => e.currentTarget.blur()}
          required
        />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Notes <span className="text-zinc-600">(optional)</span>
        </label>
        <textarea
          rows={3}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 resize-none"
          placeholder="Any additional details…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={1000}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Link
          href="/sales?tab=samples"
          className="flex-1 text-center py-2.5 text-sm font-medium text-zinc-400 hover:text-zinc-200 rounded-xl transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}
        >
          {loading ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>
    </form>
  );
}
