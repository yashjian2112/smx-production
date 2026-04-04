'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Cable } from 'lucide-react';

type Connector = {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  variantName: string | null;
  sortOrder: number;
  active: boolean;
};

type Product = { id: string; name: string; code: string; harnessVariants: string[] };

export default function HarnessConnectorAdmin({
  products,
  initialConnectors,
}: {
  products: Product[];
  initialConnectors: Connector[];
}) {
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id ?? '');
  const [connectors, setConnectors] = useState<Connector[]>(initialConnectors);
  const [saving, setSaving] = useState<string | null>(null);
  const [productList, setProductList] = useState(products);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Variant state
  const [newVariant, setNewVariant] = useState('');
  const [selectedVariant, setSelectedVariant] = useState<string>('');
  const selectedProductData = productList.find(p => p.id === selectedProduct);
  const variants = selectedProductData?.harnessVariants ?? [];

  async function addVariant() {
    const v = newVariant.trim();
    if (!v || variants.includes(v)) return;
    const updated = [...variants, v];
    setSaving('variant-add');
    try {
      const res = await fetch(`/api/products/${selectedProduct}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harnessVariants: updated }),
      });
      if (!res.ok) throw new Error(await res.text());
      setProductList(prev => prev.map(p => p.id === selectedProduct ? { ...p, harnessVariants: updated } : p));
      setNewVariant('');
    } catch (e) { console.error(e); alert('Failed to add variant'); }
    finally { setSaving(null); }
  }

  async function removeVariant(v: string) {
    const updated = variants.filter(x => x !== v);
    setSaving('variant-del');
    try {
      const res = await fetch(`/api/products/${selectedProduct}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harnessVariants: updated }),
      });
      if (!res.ok) throw new Error(await res.text());
      setProductList(prev => prev.map(p => p.id === selectedProduct ? { ...p, harnessVariants: updated } : p));
    } catch (e) { console.error(e); alert('Failed to remove variant'); }
    finally { setSaving(null); }
  }

  // Auto-select first variant if none selected
  const activeVariant = selectedVariant || variants[0] || '';

  const filtered = connectors
    .filter(c => c.productId === selectedProduct && c.active &&
      (variants.length === 0 ? true : c.variantName === activeVariant))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // ── Add new connector ──
  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving('add');
    try {
      const res = await fetch('/api/admin/harness-connectors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: selectedProduct,
          name: newName.trim(),
          description: newDesc.trim() || undefined,
          variantName: activeVariant || undefined,
          sortOrder: filtered.length,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      setConnectors(prev => [...prev, created]);
      setNewName('');
      setNewDesc('');
      setShowAddForm(false);
    } catch (e) {
      console.error(e);
      alert('Failed to create connector');
    } finally {
      setSaving(null);
    }
  }

  // ── Update connector ──
  async function handleUpdate(id: string, data: Partial<Connector>) {
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/harness-connectors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setConnectors(prev => prev.map(c => (c.id === id ? updated : c)));
    } catch (e) {
      console.error(e);
      alert('Failed to update');
    } finally {
      setSaving(null);
    }
  }

  // ── Delete (soft) connector ──
  async function handleDelete(id: string) {
    if (!confirm('Remove this connector?')) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/admin/harness-connectors/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      setConnectors(prev => prev.map(c => (c.id === id ? { ...c, active: false } : c)));
    } catch (e) {
      console.error(e);
      alert('Failed to delete');
    } finally {
      setSaving(null);
    }
  }

  // ── Reorder ──
  async function moveUp(idx: number) {
    if (idx <= 0) return;
    const items = [...filtered];
    const [item] = items.splice(idx, 1);
    items.splice(idx - 1, 0, item);
    // Update sortOrder for swapped pair
    await handleUpdate(items[idx - 1].id, { sortOrder: idx - 1 });
    await handleUpdate(items[idx].id, { sortOrder: idx });
  }

  const inputCls = 'w-full rounded-lg bg-zinc-900 border border-slate-600 px-3 py-2 text-sm focus:outline-none focus:border-sky-500';
  const btnPrimary = 'px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-medium hover:bg-sky-500 disabled:opacity-40';
  const btnSecondary = 'px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs hover:bg-slate-600';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-slate-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
        <Cable className="w-5 h-5 text-sky-400" />
        <h2 className="text-xl font-semibold">Harness Connectors</h2>
      </div>
      <p className="text-slate-400 text-sm">Configure which connectors each harness product must pass during QC testing.</p>

      {/* Product selector */}
      <select
        value={selectedProduct}
        onChange={e => { setSelectedProduct(e.target.value); setSelectedVariant(''); }}
        className="max-w-xs w-full rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none"
        style={{ backgroundColor: '#18181b', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {products.map(p => (
          <option key={p.id} value={p.id} style={{ backgroundColor: '#18181b', color: '#e4e4e7' }}>{p.code} — {p.name}</option>
        ))}
      </select>

      {/* Harness Variants */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.15)' }}>
        <p className="text-sm font-medium text-sky-400">Harness Variants</p>
        <p className="text-xs text-slate-400">These variants appear in the proforma form when this product is selected with harness.</p>
        <div className="flex flex-wrap gap-2">
          {variants.map(v => (
            <span key={v} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-sky-300"
              style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)' }}>
              {v}
              <button onClick={() => removeVariant(v)} className="text-red-400/60 hover:text-red-400 ml-0.5">
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
          {variants.length === 0 && (
            <span className="text-xs text-slate-500 italic">No variants configured</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg bg-zinc-900 border border-slate-600 px-3 py-1.5 text-sm focus:outline-none focus:border-sky-500"
            placeholder="New variant name (e.g. Ultra Bee)"
            value={newVariant}
            onChange={e => setNewVariant(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addVariant()}
          />
          <button
            className="px-3 py-1.5 rounded-lg bg-sky-600 text-white text-xs font-medium hover:bg-sky-500 disabled:opacity-40"
            onClick={addVariant}
            disabled={!newVariant.trim() || saving === 'variant-add'}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Variant selector for connectors */}
      {variants.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-300">Connectors by Variant</p>
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {variants.map(v => (
              <button
                key={v}
                onClick={() => setSelectedVariant(v)}
                className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg transition-all ${
                  activeVariant === v ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                style={activeVariant === v ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}
              >
                {v}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500">
            {`Connectors for "${activeVariant}" variant`}
          </p>
        </div>
      )}

      {/* Connector list */}
      <div className="space-y-2">
        {filtered.length === 0 && !showAddForm && (
          <p className="text-slate-500 text-sm py-4 text-center">No connectors configured for this product yet.</p>
        )}
        {filtered.map((c, idx) => (
          <div
            key={c.id}
            className="flex items-center gap-3 p-3 rounded-lg bg-smx-surface border border-slate-700"
          >
            <button
              onClick={() => moveUp(idx)}
              disabled={idx === 0}
              className="text-slate-500 hover:text-white disabled:opacity-20"
              title="Move up"
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <div className="flex-1 min-w-0">
              <EditableField
                value={c.name}
                placeholder="Connector name"
                onSave={val => handleUpdate(c.id, { name: val })}
                saving={saving === c.id}
                bold
              />
              <EditableField
                value={c.description ?? ''}
                placeholder="Description (optional)"
                onSave={val => handleUpdate(c.id, { description: val || null })}
                saving={saving === c.id}
                small
              />
            </div>
            <span className="text-slate-600 text-[10px] font-mono">#{idx + 1}</span>
            <button
              onClick={() => handleDelete(c.id)}
              className="text-red-400/60 hover:text-red-400"
              title="Remove"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAddForm ? (
        <div className="p-4 rounded-lg bg-smx-surface border border-sky-600/40 space-y-3">
          <p className="text-sm font-medium text-sky-400">
            New Connector{activeVariant ? ` — ${activeVariant}` : ''}
          </p>
          <input
            className={inputCls}
            placeholder="Connector name (e.g. CAN, USB, Phase U, Hall Sensor)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            autoFocus
          />
          <input
            className={inputCls}
            placeholder="Description (optional)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <div className="flex gap-2">
            <button className={btnPrimary} onClick={handleAdd} disabled={!newName.trim() || saving === 'add'}>
              {saving === 'add' ? 'Saving...' : 'Add Connector'}
            </button>
            <button className={btnSecondary} onClick={() => { setShowAddForm(false); setNewName(''); setNewDesc(''); }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className={btnSecondary + ' flex items-center gap-1.5'} onClick={() => setShowAddForm(true)}>
          <Plus className="w-3.5 h-3.5" /> Add Connector
        </button>
      )}
    </div>
  );
}

/** Inline editable field */
function EditableField({
  value,
  placeholder,
  onSave,
  saving,
  bold,
  small,
}: {
  value: string;
  placeholder: string;
  onSave: (val: string) => void;
  saving: boolean;
  bold?: boolean;
  small?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          className={`bg-zinc-900 border border-slate-600 rounded px-2 py-0.5 text-sm focus:outline-none focus:border-sky-500 ${small ? 'text-xs' : ''}`}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { onSave(draft); setEditing(false); }
            if (e.key === 'Escape') { setDraft(value); setEditing(false); }
          }}
          placeholder={placeholder}
          autoFocus
        />
        <button
          onClick={() => { onSave(draft); setEditing(false); }}
          disabled={saving}
          className="text-sky-400 hover:text-sky-300"
        >
          <Save className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <p
      onClick={() => { setDraft(value); setEditing(true); }}
      className={`cursor-pointer hover:text-sky-400 truncate ${bold ? 'font-medium text-sm' : ''} ${small ? 'text-xs text-slate-400' : ''} ${!value ? 'text-slate-600 italic' : ''}`}
    >
      {value || placeholder}
    </p>
  );
}
