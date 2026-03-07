'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Product = { id: string; code: string; name: string };

export function CreateOrderForm({ products }: { products: Product[] }) {
  const [open, setOpen] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [quantity, setQuantity] = useState(10);
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNumber.trim(),
          productId,
          quantity,
          dueDate: dueDate || undefined,
          priority,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed');
        return;
      }
      setOpen(false);
      setOrderNumber('');
      setQuantity(10);
      setDueDate('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 font-medium tap-target"
      >
        Create order
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
      <div className="bg-smx-surface border border-slate-600 rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Create order</h3>
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <label className="block text-sm text-slate-400 mb-1">Order number</label>
        <input
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 mb-3"
          required
        />
        <label className="block text-sm text-slate-400 mb-1">Product</label>
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 mb-3"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
          ))}
        </select>
        <label className="block text-sm text-slate-400 mb-1">Quantity</label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 mb-3"
        />
        <label className="block text-sm text-slate-400 mb-1">Due date (optional)</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 mb-3"
        />
        <label className="block text-sm text-slate-400 mb-1">Priority</label>
        <input
          type="number"
          value={priority}
          onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 mb-4"
        />
        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 font-medium disabled:opacity-50">
            {loading ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-slate-600 hover:bg-slate-700">
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
