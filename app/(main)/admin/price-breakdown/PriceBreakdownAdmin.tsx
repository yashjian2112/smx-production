'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Factor = {
  id: string; name: string; description?: string | null;
  category?: string | null; isRequired: boolean; order: number;
  createdBy: { name: string };
};

export default function PriceBreakdownAdmin({ factors: initial }: { factors: Factor[] }) {
  const router = useRouter();
  const [factors, setFactors] = useState<Factor[]>(initial);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Factor | null>(null);

  async function save(data: Partial<Factor> & { name: string }, id?: string) {
    const url  = id ? `/api/admin/price-breakdown-factors/${id}` : '/api/admin/price-breakdown-factors';
    const method = id ? 'PATCH' : 'POST';
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!r.ok) { const e = await r.json(); alert(e.error); return; }
    setCreating(false); setEditing(null);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm('Remove this factor?')) return;
    await fetch(`/api/admin/price-breakdown-factors/${id}`, { method: 'DELETE' });
    setFactors(prev => prev.filter(f => f.id !== id));
  }

  const grouped = factors.reduce<Record<string, Factor[]>>((acc, f) => {
    const key = f.category ?? 'All Categories';
    (acc[key] = acc[key] ?? []).push(f);
    return acc;
  }, {});

  return (
    <main className="min-h-screen pb-24" style={{ background: 'rgb(9,9,11)' }}>
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Price Breakdown Factors</h1>
            <p className="text-zinc-400 text-sm mt-1">Vendors must fill in these cost factors when submitting quotes</p>
          </div>
          <button onClick={() => setCreating(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium">
            + Add Factor
          </button>
        </div>

        {factors.length === 0 && (
          <div className="text-center text-zinc-500 py-12">No factors defined yet. Add one to require vendors to break down their pricing.</div>
        )}

        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="mb-6">
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{cat}</div>
            <div className="space-y-2">
              {items.map(f => (
                <div key={f.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{f.name}</span>
                      {f.isRequired && <span className="px-1.5 py-0.5 rounded text-xs bg-red-900/40 text-red-300 border border-red-700/40">Required</span>}
                    </div>
                    {f.description && <div className="text-xs text-zinc-500 mt-0.5">{f.description}</div>}
                    <div className="text-xs text-zinc-600 mt-0.5">Order: {f.order} · Added by {f.createdBy.name}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(f)} className="text-xs text-blue-400 hover:text-blue-300">Edit</button>
                    <button onClick={() => remove(f.id)} className="text-xs text-red-400 hover:text-red-300">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {(creating || editing) && (
        <FactorModal
          initial={editing ?? undefined}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(data) => save(data, editing?.id)}
        />
      )}
    </main>
  );
}

function FactorModal({
  initial, onClose, onSave
}: {
  initial?: Factor;
  onClose: () => void;
  onSave: (data: { name: string; description?: string; category?: string; isRequired: boolean; order: number }) => void;
}) {
  const [name, setName]           = useState(initial?.name ?? '');
  const [desc, setDesc]           = useState(initial?.description ?? '');
  const [category, setCategory]   = useState(initial?.category ?? '');
  const [required, setRequired]   = useState(initial?.isRequired ?? true);
  const [order, setOrder]         = useState(initial?.order ?? 0);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-full max-w-md">
        <h2 className="text-white font-semibold text-lg mb-4">{initial ? 'Edit Factor' : 'Add Price Breakdown Factor'}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Factor Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Material Cost, Labor, Overhead"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What this cost covers"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Vendor Category (leave blank for all)</label>
            <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Electrical, Mechanical"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-zinc-400 mb-1">Display Order</label>
              <input type="number" value={order} onChange={e => setOrder(Number(e.target.value))} min={0}
                onWheel={(e) => e.currentTarget.blur()}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm" />
            </div>
            <div className="flex items-end pb-2 gap-2">
              <input type="checkbox" id="req" checked={required} onChange={e => setRequired(e.target.checked)} className="w-4 h-4" />
              <label htmlFor="req" className="text-sm text-zinc-300">Required</label>
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
          <button onClick={() => { if (!name.trim()) return alert('Name required'); onSave({ name, description: desc || undefined, category: category || undefined, isRequired: required, order }); }}
            className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">
            {initial ? 'Save Changes' : 'Add Factor'}
          </button>
        </div>
      </div>
    </div>
  );
}
