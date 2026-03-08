'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';

const STAGES = [
  { key: 'POWERSTAGE_MANUFACTURING', label: 'Powerstage' },
  { key: 'BRAINBOARD_MANUFACTURING', label: 'Brainboard' },
  { key: 'CONTROLLER_ASSEMBLY',      label: 'Assembly' },
  { key: 'QC_AND_SOFTWARE',          label: 'QC & Software' },
  { key: 'FINAL_ASSEMBLY',           label: 'Final Assembly' },
];

type ChecklistItem = {
  id: string;
  stage: string;
  name: string;
  description: string | null;
  referenceImageUrl: string | null;
  required: boolean;
  sortOrder: number;
  active: boolean;
};

type Props = { initialItems: ChecklistItem[] };

export function ChecklistAdmin({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems);
  const [activeStage, setActiveStage] = useState(STAGES[0].key);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // form state
  const [form, setForm] = useState({ name: '', description: '', required: true, sortOrder: 0 });
  const [refImage, setRefImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const stageItems = items.filter((i) => i.stage === activeStage);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setRefImage(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      fd.append('stage', activeStage);
      fd.append('name', form.name);
      fd.append('description', form.description);
      fd.append('required', String(form.required));
      fd.append('sortOrder', String(form.sortOrder));
      if (refImage) fd.append('referenceImage', refImage);

      const res = await fetch('/api/admin/checklists', { method: 'POST', body: fd });
      if (!res.ok) { setError('Failed to save'); return; }
      const item = await res.json();
      setItems((prev) => [...prev, item]);
      setShowAdd(false);
      setForm({ name: '', description: '', required: true, sortOrder: 0 });
      setRefImage(null); setPreviewUrl('');
    } finally { setSaving(false); }
  }

  async function toggleActive(item: ChecklistItem) {
    const res = await fetch(`/api/admin/checklists/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this checklist item?')) return;
    const res = await fetch(`/api/admin/checklists/${id}`, { method: 'DELETE' });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-zinc-500 hover:text-white text-sm">← Admin</Link>
        <h2 className="text-xl font-semibold">Stage Checklists</h2>
      </div>
      <p className="text-zinc-500 text-sm">
        Define what components employees must photograph at each stage. The AI uses these to verify each build.
      </p>

      {/* Stage tabs */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {STAGES.map((s) => {
          const count = items.filter((i) => i.stage === s.key && i.active).length;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => { setActiveStage(s.key); setShowAdd(false); }}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${activeStage === s.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              style={activeStage === s.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}
            >
              {s.label} {count > 0 && <span className="ml-1 opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {stageItems.length === 0 && !showAdd && (
          <div className="card p-6 text-center text-zinc-500 text-sm">
            No checklist items for this stage yet.
          </div>
        )}
        {stageItems.map((item) => (
          <div
            key={item.id}
            className="card p-4 flex items-start gap-4"
            style={{ opacity: item.active ? 1 : 0.5 }}
          >
            {/* Reference image */}
            <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {item.referenceImageUrl ? (
                <Image src={item.referenceImageUrl} alt={item.name} width={64} height={64} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{item.name}</span>
                {item.required && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>REQUIRED</span>
                )}
                <span className="text-[10px] text-zinc-600">#{item.sortOrder}</span>
              </div>
              {item.description && <p className="text-zinc-500 text-xs mt-1">{item.description}</p>}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => toggleActive(item)}
                className={`text-xs px-2 py-1 rounded-lg ${item.active ? 'text-green-400' : 'text-zinc-600'}`}
                style={{ background: item.active ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)' }}
              >
                {item.active ? 'Active' : 'Inactive'}
              </button>
              <button type="button" onClick={() => deleteItem(item.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="card p-4 space-y-4">
          <h3 className="text-sm font-semibold">New checklist item — {STAGES.find(s => s.key === activeStage)?.label}</h3>
          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div>
            <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Component name *</label>
            <input
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Main capacitor bank"
              className="input-field text-sm"
            />
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Acceptance criteria</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="What should the AI look for? E.g. All capacitors seated, no bent pins"
              className="input-field text-sm resize-none"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Sort order</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                className="input-field text-sm"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.required}
                  onChange={e => setForm(f => ({ ...f, required: e.target.checked }))}
                  className="w-4 h-4 accent-sky-400"
                />
                <span className="text-sm text-zinc-300">Required</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Reference image (optional)</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors"
              style={{ borderColor: previewUrl ? 'rgba(14,165,233,0.4)' : 'rgba(255,255,255,0.1)' }}
            >
              {previewUrl ? (
                <Image src={previewUrl} alt="Preview" width={200} height={120} className="mx-auto rounded-lg object-cover max-h-32" />
              ) : (
                <p className="text-zinc-600 text-sm">Click to upload reference image</p>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 py-2.5 text-sm">
              {saving ? 'Saving…' : 'Add item'}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost px-4 py-2.5 text-sm">Cancel</button>
          </div>
        </form>
      )}

      {!showAdd && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="w-full py-3 rounded-xl text-sm text-sky-400 font-medium transition-colors hover:brightness-125"
          style={{ background: 'rgba(14,165,233,0.08)', border: '1px dashed rgba(14,165,233,0.3)' }}
        >
          + Add checklist item
        </button>
      )}
    </div>
  );
}
