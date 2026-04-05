'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Camera, Upload, Trash2 } from 'lucide-react';
import { QRCodeCanvas } from '@/components/QRCode';

type Product = { id: string; code: string; name: string; description: string | null; productType?: string; hsnCode?: string | null; colors?: string[]; active: boolean };

type Component = {
  id: string;
  name: string;
  partNumber: string | null;
  barcode: string | null;
  stage: string | null;
  sortOrder: number;
  required: boolean;
};

// Only 4 stages get component barcodes
const COMPONENT_STAGES = [
  { value: 'POWERSTAGE_MANUFACTURING', label: 'Powerstage' },
  { value: 'BRAINBOARD_MANUFACTURING', label: 'Brainboard' },
  { value: 'CONTROLLER_ASSEMBLY', label: 'Assembly' },
  { value: 'FINAL_ASSEMBLY', label: 'Final Assembly' },
] as const;

type StageValue = typeof COMPONENT_STAGES[number]['value'];

function StageSection({
  stageValue,
  stageLabel,
  components,
  productId,
  onAdded,
  onDeleted,
}: {
  stageValue: StageValue;
  stageLabel: string;
  components: Component[];
  productId: string;
  onAdded: (c: Component) => void;
  onDeleted: (id: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPart, setAddPart] = useState('');
  const [addRequired, setAddRequired] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function addComponent(e: React.FormEvent) {
    e.preventDefault();
    if (!addName.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/products/${productId}/components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addName.trim(),
          partNumber: addPart.trim() || undefined,
          stage: stageValue,
          required: addRequired,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      onAdded(data);
      setAddName(''); setAddPart(''); setAddRequired(true); setAddOpen(false);
    } finally { setSaving(false); }
  }

  async function deleteComponent(compId: string) {
    if (!confirm('Remove this component?')) return;
    const res = await fetch(`/api/products/${productId}/components/${compId}`, { method: 'DELETE' });
    if (res.ok) onDeleted(compId);
  }

  const stageComponents = components.filter((c) => c.stage === stageValue);

  return (
    <div style={{ borderLeft: '2px solid rgba(14,165,233,0.2)', paddingLeft: 12 }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-sky-400 uppercase tracking-widest">{stageLabel}</span>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="text-xs text-zinc-500 hover:text-sky-400 flex items-center gap-1"
        >
          + Add
        </button>
      </div>

      {stageComponents.length === 0 && !addOpen && (
        <p className="text-zinc-700 text-xs italic mb-2">No components</p>
      )}

      <div className="space-y-2">
        {stageComponents.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {c.barcode && (
              <QRCodeCanvas value={c.barcode} size={48} dark="#e2e8f0" light="transparent" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-white">{c.name}</span>
                {c.partNumber && <span className="font-mono text-xs text-zinc-600">{c.partNumber}</span>}
                {c.required && <span className="text-[10px] text-amber-400 border border-amber-400/20 px-1 rounded">required</span>}
              </div>
              {c.barcode && (
                <p className="font-mono text-[10px] text-zinc-600 mt-0.5">{c.barcode}</p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              {c.barcode && (
                <a
                  href={`/print/component/${c.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded font-medium transition-colors"
                  style={{ background: 'rgba(14,165,233,0.08)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.15)' }}
                  title={c.stage === 'FINAL_ASSEMBLY' ? 'Open controller serial label list' : 'Print component barcode stickers'}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                  {c.stage === 'FINAL_ASSEMBLY' ? 'Controller Labels' : 'Print'}
                </a>
              )}
              <button
                onClick={() => deleteComponent(c.id)}
                className="text-zinc-700 hover:text-red-400 p-1"
                title="Remove component"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4h6v2" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {addOpen && (
        <form onSubmit={addComponent} className="mt-2 p-3 rounded-xl space-y-2" style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.15)' }}>
          <p className="text-[11px] text-sky-400 font-medium uppercase tracking-wide">New {stageLabel} component</p>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="Component name (e.g. MOSFET IRFB4227) *"
            className="input-field text-xs py-1.5"
            required
            autoFocus
          />
          <input
            value={addPart}
            onChange={(e) => setAddPart(e.target.value)}
            placeholder="Part number (optional)"
            className="input-field text-xs py-1.5"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <input type="checkbox" checked={addRequired} onChange={(e) => setAddRequired(e.target.checked)} className="rounded" />
              Required
            </label>
            <p className="text-[10px] text-zinc-600">Barcode auto-generated</p>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary py-1.5 px-3 text-xs">
              {saving ? 'Saving…' : 'Add component'}
            </button>
            <button type="button" onClick={() => { setAddOpen(false); setError(''); }} className="btn-ghost py-1.5 px-3 text-xs">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ComponentsPanel({ product }: { product: Product }) {
  const [components, setComponents] = useState<Component[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function loadComponents() {
    if (components !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${product.id}/components`);
      const data = await res.json();
      setComponents(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await loadComponents();
  }

  function onAdded(c: Component) {
    setComponents((prev) => [...(prev ?? []), c]);
  }

  function onDeleted(id: string) {
    setComponents((prev) => (prev ?? []).filter((c) => c.id !== id));
  }

  const total = components?.length ?? '…';

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d={open ? 'M18 15l-6-6-6 6' : 'M6 9l6 6 6-6'} />
        </svg>
        <span className="font-medium">Components</span>
        <span className="text-zinc-700">({total})</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {loading && <p className="text-zinc-700 text-xs">Loading…</p>}
          {!loading && components !== null && COMPONENT_STAGES.map(({ value, label }) => (
            <StageSection
              key={value}
              stageValue={value}
              stageLabel={label}
              components={components}
              productId={product.id}
              onAdded={onAdded}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const REFERENCE_STAGES = [
  { value: 'POWERSTAGE_MANUFACTURING', label: 'Powerstage' },
  { value: 'BRAINBOARD_MANUFACTURING', label: 'Brainboard' },
] as const;

type StageRef = { id: string; stage: string; imageUrl: string };

function ReferenceImagesPanel({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState<StageRef[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);

  async function loadRefs() {
    if (refs !== null) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stage-references?productId=${product.id}`);
      const data = await res.json();
      setRefs(Array.isArray(data) ? data : []);
    } finally { setLoading(false); }
  }

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) await loadRefs();
  }

  async function uploadImage(stage: string, file: File) {
    setUploading(stage);
    try {
      const form = new FormData();
      form.append('productId', product.id);
      form.append('stage', stage);
      form.append('image', file);
      const res = await fetch('/api/admin/stage-references', { method: 'POST', body: form });
      if (res.ok) {
        const data = await res.json();
        setRefs(prev => {
          const filtered = (prev ?? []).filter(r => r.stage !== stage);
          return [...filtered, data];
        });
      }
    } finally { setUploading(null); }
  }

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <button type="button" onClick={toggle}
        className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300">
        <Camera className="w-3 h-3" />
        <span className="font-medium">Reference Images</span>
        <span className="text-zinc-700">({refs?.length ?? '…'})</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {loading && <p className="text-zinc-700 text-xs">Loading...</p>}
          {!loading && REFERENCE_STAGES.map(({ value, label }) => {
            const ref = refs?.find(r => r.stage === value);
            const isUploading = uploading === value;
            return (
              <div key={value} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs font-semibold text-sky-400 uppercase tracking-widest mb-2">{label}</p>
                {ref ? (
                  <div className="flex items-center gap-3">
                    <div className="relative w-20 h-16 rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                      <Image src={ref.imageUrl} alt={label} fill className="object-cover" unoptimized />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-green-400 font-medium">Reference uploaded</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">Used for board verification during manufacturing</p>
                    </div>
                    <label className="cursor-pointer text-xs px-2 py-1 rounded-lg text-sky-400 hover:text-sky-300"
                      style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.15)' }}>
                      <Upload className="w-3 h-3 inline mr-1" />Replace
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(value, f); }} />
                    </label>
                  </div>
                ) : (
                  <label className={`flex flex-col items-center gap-2 py-4 rounded-xl cursor-pointer transition-all ${isUploading ? 'opacity-50' : 'hover:border-sky-500/30'}`}
                    style={{ background: 'rgba(14,165,233,0.05)', border: '1px dashed rgba(14,165,233,0.2)' }}>
                    <Camera className="w-5 h-5 text-sky-400/60" />
                    <span className="text-xs text-sky-400/60">{isUploading ? 'Uploading...' : 'Upload reference photo'}</span>
                    <input type="file" accept="image/*" className="hidden" disabled={isUploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(value, f); }} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProductsAdmin({ products }: { products: Product[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [productType, setProductType] = useState<'MANUFACTURED' | 'TRADING'>('MANUFACTURED');
  const [hsnCode, setHsnCode] = useState('85371000');
  const [colors, setColors] = useState<string[]>([]);
  const [newColor, setNewColor] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editProductType, setEditProductType] = useState<'MANUFACTURED' | 'TRADING'>('MANUFACTURED');
  const [editHsnCode, setEditHsnCode] = useState('');
  const [editColors, setEditColors] = useState<string[]>([]);
  const [editNewColor, setEditNewColor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), name: name.trim(), description: description.trim() || undefined, productType, hsnCode: hsnCode.trim() || undefined, colors: colors.length > 0 ? colors : undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      setAdding(false);
      setCode(''); setName(''); setDescription(''); setProductType('MANUFACTURED'); setHsnCode('85371000'); setColors([]); setNewColor('');
      router.refresh();
    } finally { setLoading(false); }
  }

  async function saveEdit(id: string) {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), description: editDescription.trim() || undefined, productType: editProductType, hsnCode: editHsnCode.trim() || undefined, colors: editColors }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Failed'); return; }
      setEditId(null);
      router.refresh();
    } finally { setLoading(false); }
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    });
    router.refresh();
  }

  function startEdit(p: Product) {
    setEditId(p.id);
    setEditName(p.name);
    setEditDescription(p.description ?? '');
    setEditProductType((p.productType as 'MANUFACTURED' | 'TRADING') ?? 'MANUFACTURED');
    setEditHsnCode(p.hsnCode ?? '');
    setEditColors(p.colors ?? []);
    setEditNewColor('');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Products</h2>
        <button onClick={() => setAdding(true)} className="btn-primary py-2 px-4 text-sm">
          + Add product
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {adding && (
        <form onSubmit={addProduct} className="card p-4 space-y-3" style={{ borderColor: 'rgba(14,165,233,0.3)' }}>
          <p className="text-sm font-medium text-sky-400">New product</p>
          <div className="flex gap-3">
            <div className="w-28">
              <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. C350" maxLength={10} className="input-field text-sm" required />
            </div>
            <div className="flex-1">
              <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. C350 Controller" className="input-field text-sm" required />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">Description (optional)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="input-field text-sm" />
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">Product Type</label>
            <div className="flex gap-2">
              {(['MANUFACTURED', 'TRADING'] as const).map(t => (
                <button key={t} type="button" onClick={() => { setProductType(t); setHsnCode(t === 'TRADING' ? '85011090' : '85371000'); }}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    productType === t
                      ? t === 'MANUFACTURED' ? 'bg-sky-600 text-white' : 'bg-amber-600 text-white'
                      : 'text-zinc-400 border border-zinc-700 hover:text-white'
                  }`}>
                  {t === 'MANUFACTURED' ? 'Manufactured' : 'Trading (Buy & Sell)'}
                </button>
              ))}
            </div>
            {productType === 'TRADING' && (
              <p className="text-amber-400/70 text-[10px] mt-1">Trading items skip production stages — units are ready for dispatch immediately after order creation</p>
            )}
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">HSN Code</label>
            <input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="e.g. 85371000" className="input-field text-sm font-mono" />
            <p className="text-[10px] text-zinc-600 mt-0.5">
              {hsnCode === '85371000' ? 'Motor Controller' : hsnCode === '85011090' ? 'Electric Motor' : 'Custom HSN'}
            </p>
          </div>
          <div>
            <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">Colors (optional)</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {colors.map(c => (
                <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {c}
                  <button type="button" onClick={() => setColors(prev => prev.filter(x => x !== c))} className="text-zinc-500 hover:text-red-400">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="e.g. Black, Silver, White"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newColor.trim() && !colors.includes(newColor.trim())) { setColors(prev => [...prev, newColor.trim()]); setNewColor(''); } } }}
                className="input-field text-sm flex-1" />
              <button type="button" onClick={() => { if (newColor.trim() && !colors.includes(newColor.trim())) { setColors(prev => [...prev, newColor.trim()]); setNewColor(''); } }}
                className="btn-ghost py-1 px-3 text-xs">Add</button>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="btn-primary py-2 px-4 text-sm">{loading ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={() => setAdding(false)} className="btn-ghost py-2 px-4 text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {products.map((p) => (
          <div key={p.id} className={`card p-4 ${!p.active ? 'opacity-60' : ''}`}>
            {editId === p.id ? (
              <div className="space-y-2">
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="input-field text-sm" />
                <input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Description (optional)" className="input-field text-sm" />
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">Product Type</label>
                  <div className="flex gap-2">
                    {(['MANUFACTURED', 'TRADING'] as const).map(t => (
                      <button key={t} type="button" onClick={() => { setEditProductType(t); if (!editHsnCode || editHsnCode === '85371000' || editHsnCode === '85011090') setEditHsnCode(t === 'TRADING' ? '85011090' : '85371000'); }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          editProductType === t
                            ? t === 'MANUFACTURED' ? 'bg-sky-600 text-white' : 'bg-amber-600 text-white'
                            : 'text-zinc-400 border border-zinc-700 hover:text-white'
                        }`}>
                        {t === 'MANUFACTURED' ? 'Manufactured' : 'Trading'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">HSN Code</label>
                  <input value={editHsnCode} onChange={(e) => setEditHsnCode(e.target.value)} placeholder="e.g. 85371000" className="input-field text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">Colors</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editColors.map(c => (
                      <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {c}
                        <button type="button" onClick={() => setEditColors(prev => prev.filter(x => x !== c))} className="text-zinc-500 hover:text-red-400">×</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={editNewColor} onChange={(e) => setEditNewColor(e.target.value)} placeholder="e.g. Black, Silver"
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (editNewColor.trim() && !editColors.includes(editNewColor.trim())) { setEditColors(prev => [...prev, editNewColor.trim()]); setEditNewColor(''); } } }}
                      className="input-field text-sm flex-1" />
                    <button type="button" onClick={() => { if (editNewColor.trim() && !editColors.includes(editNewColor.trim())) { setEditColors(prev => [...prev, editNewColor.trim()]); setEditNewColor(''); } }}
                      className="btn-ghost py-1 px-3 text-xs">Add</button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => saveEdit(p.id)} disabled={loading} className="btn-primary py-1 px-3 text-xs">{loading ? 'Saving…' : 'Save'}</button>
                  <button onClick={() => setEditId(null)} className="btn-ghost py-1 px-3 text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-zinc-500 px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>{p.code}</span>
                      <span className="font-medium text-sm">{p.name}</span>
                      {p.productType === 'TRADING' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/30 text-amber-400 font-medium">Trading</span>
                      )}
                      {p.hsnCode && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 font-mono">HSN {p.hsnCode}</span>
                      )}
                      {(p.colors?.length ?? 0) > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400">{p.colors!.join(', ')}</span>
                      )}
                      {!p.active && <span className="text-xs text-zinc-600">inactive</span>}
                    </div>
                    {p.description && <p className="text-zinc-500 text-xs mt-0.5">{p.description}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(p)} className="btn-ghost py-1 px-3 text-xs">Edit</button>
                    <button
                      onClick={() => toggleActive(p.id, p.active)}
                      className={`py-1 px-3 rounded-lg text-xs border ${p.active ? 'border-zinc-700 hover:border-red-500/50 hover:text-red-400' : 'border-green-500/40 text-green-400 hover:bg-green-500/10'}`}
                    >
                      {p.active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </div>
                {p.productType !== 'TRADING' && <ComponentsPanel product={p} />}
                {p.productType !== 'TRADING' && <ReferenceImagesPanel product={p} />}
                {p.productType === 'TRADING' && (
                  <p className="text-zinc-600 text-xs mt-2 italic">Trading items have no manufacturing components</p>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
