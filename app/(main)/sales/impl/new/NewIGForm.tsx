'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X } from 'lucide-react';

type ClientOption = { id: string; code: string; customerName: string };

type IGItem = {
  name: string;
  qty: number;
  unit: string;
  condition: string;
};

export default function NewIGForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();

  const [clientId,       setClientId]       = useState('');
  const [description,    setDescription]    = useState('');
  const [expectedArrival,setExpectedArrival]= useState('');
  const [expectedReturn, setExpectedReturn] = useState('');
  const [purpose,        setPurpose]        = useState('');
  const [notes,          setNotes]          = useState('');
  const [items,         setItems]         = useState<IGItem[]>([
    { name: '', qty: 1, unit: 'pcs', condition: 'New' },
  ]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  function addItem() {
    setItems((prev) => [...prev, { name: '', qty: 1, unit: 'pcs', condition: 'New' }]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof IGItem, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => i === idx ? { ...item, [field]: value } : item)
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!clientId) { setError('Please select a client.'); return; }
    if (!description.trim()) { setError('Description is required.'); return; }
    if (!expectedReturn) { setError('Expected return date is required.'); return; }
    if (!purpose.trim()) { setError('Purpose is required.'); return; }
    if (items.some((item) => !item.name.trim())) {
      setError('All items must have a name.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/implementation-goods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          description,
          items,
          expectedArrival: expectedArrival || undefined,
          expectedReturn:  expectedReturn  || undefined,
          purpose:         purpose         || undefined,
          notes:           notes           || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create IG entry.');
        return;
      }

      router.push('/sales?tab=impl');
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

      {/* Description */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Description <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500"
          placeholder="Brief description of goods / purpose…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          maxLength={500}
        />
      </div>

      {/* Items list */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-zinc-400">
            Items <span className="text-red-400">*</span>
          </label>
          <button
            type="button"
            onClick={addItem}
            className="text-[11px] font-semibold px-2 py-0.5 rounded-lg transition-colors"
            style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.25)' }}
          >
            + Add item
          </button>
        </div>

        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="rounded-xl p-3 space-y-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-600 font-mono">Item {idx + 1}</span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Item name *"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500"
                value={item.name}
                onChange={(e) => updateItem(idx, 'name', e.target.value)}
                required
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  min={1}
                  placeholder="Qty"
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  value={item.qty}
                  onChange={(e) => updateItem(idx, 'qty', parseInt(e.target.value, 10) || 1)}
                  onWheel={(e) => e.currentTarget.blur()}
                />
                <input
                  type="text"
                  placeholder="Unit"
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500"
                  value={item.unit}
                  onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Condition"
                  className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500"
                  value={item.condition}
                  onChange={(e) => updateItem(idx, 'condition', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Expected arrival date */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Expected Arrival Date <span className="text-zinc-600">(optional)</span>
        </label>
        <input
          type="date"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
          value={expectedArrival}
          onChange={(e) => setExpectedArrival(e.target.value)}
        />
      </div>

      {/* Expected return */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Expected Return Date <span className="text-red-400">*</span>
        </label>
        <input
          type="date"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
          value={expectedReturn}
          onChange={(e) => setExpectedReturn(e.target.value)}
          required
        />
      </div>

      {/* Purpose */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Purpose <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500"
          placeholder="Research, demo, installation…"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          required
          maxLength={500}
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
          href="/sales?tab=impl"
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
          {loading ? 'Saving…' : 'Create Entry'}
        </button>
      </div>
    </form>
  );
}
