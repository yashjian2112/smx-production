'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BoardLocationPicker, zonesToText, parseZoneIds } from '@/components/BoardLocationPicker';

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
  expectedCount: number | null;
  orientationRule: string | null;
  boardLocation: string | null;
  isBoardReference: boolean;
  required: boolean;
  sortOrder: number;
  active: boolean;
};

type Props = { initialItems: ChecklistItem[] };

export function ChecklistAdmin({ initialItems }: Props) {
  const [items, setItems]           = useState(initialItems);
  const [activeStage, setActiveStage] = useState(STAGES[0].key);
  const [showAdd, setShowAdd]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  // Board reference image state
  const boardRefInputRef             = useRef<HTMLInputElement>(null);
  const [boardRefFile, setBoardRefFile] = useState<File | null>(null);
  const [boardRefPreview, setBoardRefPreview] = useState('');
  const [savingBoardRef, setSavingBoardRef]   = useState(false);

  // Component form state
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: '', description: '', required: true, sortOrder: 0,
    expectedCount: '', orientationRule: '', boardLocation: '',
  });
  const [refImage, setRefImage]   = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const stageItems    = items.filter((i) => i.stage === activeStage && !i.isBoardReference);
  const boardRefItem  = items.find((i) => i.stage === activeStage && i.isBoardReference);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setRefImage(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function handleBoardRefChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBoardRefFile(f);
    setBoardRefPreview(URL.createObjectURL(f));
  }

  // Save / replace board reference image for this stage
  async function saveBoardRef() {
    if (!boardRefFile) return;
    setSavingBoardRef(true); setError('');
    try {
      const fd = new FormData();
      fd.append('stage', activeStage);
      fd.append('name', '__BOARD_REFERENCE__');
      fd.append('isBoardReference', 'true');
      fd.append('required', 'false');
      fd.append('sortOrder', '-999');
      fd.append('referenceImage', boardRefFile);

      if (boardRefItem) {
        // Update existing board reference
        const res = await fetch(`/api/admin/checklists/${boardRefItem.id}`, { method: 'PATCH', body: fd });
        if (!res.ok) { setError('Failed to save board reference'); return; }
        const updated = await res.json();
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      } else {
        // Create new board reference item
        const res = await fetch('/api/admin/checklists', { method: 'POST', body: fd });
        if (!res.ok) { setError('Failed to save board reference'); return; }
        const item = await res.json();
        setItems((prev) => [...prev, item]);
      }
      setBoardRefFile(null);
      setBoardRefPreview('');
    } finally { setSavingBoardRef(false); }
  }

  async function deleteBoardRef() {
    if (!boardRefItem) return;
    if (!confirm('Remove the board reference image for this stage?')) return;
    const res = await fetch(`/api/admin/checklists/${boardRefItem.id}`, { method: 'DELETE' });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== boardRefItem.id));
      setBoardRefPreview('');
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      fd.append('stage',          activeStage);
      fd.append('name',           form.name);
      fd.append('description',    form.description);
      fd.append('required',       String(form.required));
      fd.append('sortOrder',      String(form.sortOrder));
      fd.append('expectedCount',  form.expectedCount);
      fd.append('orientationRule', form.orientationRule);
      fd.append('boardLocation',   form.boardLocation);
      fd.append('isBoardReference', 'false');
      if (refImage) fd.append('referenceImage', refImage);

      const res = await fetch('/api/admin/checklists', { method: 'POST', body: fd });
      if (!res.ok) { setError('Failed to save'); return; }
      const item = await res.json();
      setItems((prev) => [...prev, item]);
      setShowAdd(false);
      setForm({ name: '', description: '', required: true, sortOrder: 0, expectedCount: '', orientationRule: '', boardLocation: '' });
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
        Define what components the AI must verify at each stage. Upload a board reference image and add each component with count and orientation rules.
      </p>

      {/* Stage tabs */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {STAGES.map((s) => {
          const count = items.filter((i) => i.stage === s.key && i.active && !i.isBoardReference).length;
          const hasRef = items.some((i) => i.stage === s.key && i.isBoardReference && i.referenceImageUrl);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => { setActiveStage(s.key); setShowAdd(false); }}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeStage === s.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              style={activeStage === s.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}
            >
              {hasRef && <span className="text-green-400 text-[10px]">●</span>}
              {s.label} {count > 0 && <span className="opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* ── Board Reference Image ─────────────────────────────────────────────── */}
      <div className="card p-4 space-y-3" style={{ border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.03)' }}>
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-base">📸</span>
          <div>
            <p className="text-sm font-semibold text-amber-300">Board Reference Image</p>
            <p className="text-[11px] text-zinc-500">Upload a clear top-down photo of a CORRECT completed board. The AI will compare every employee submission against this image.</p>
          </div>
        </div>

        <div className="flex gap-3 items-start">
          {/* Current reference */}
          <div
            className="relative w-32 h-24 rounded-xl overflow-hidden shrink-0 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${boardRefItem?.referenceImageUrl ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.1)'}` }}
            onClick={() => boardRefInputRef.current?.click()}
          >
            {(boardRefPreview || boardRefItem?.referenceImageUrl) ? (
              <Image
                src={boardRefPreview || boardRefItem!.referenceImageUrl!}
                alt="Board reference"
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,0.4)" strokeWidth="1.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <p className="text-[10px] text-zinc-600">Click to upload</p>
              </div>
            )}
            {boardRefItem?.referenceImageUrl && !boardRefPreview && (
              <div className="absolute top-1 right-1">
                <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.8)', color: 'white' }}>✓ SET</span>
              </div>
            )}
          </div>
          <input ref={boardRefInputRef} type="file" accept="image/*" className="hidden" onChange={handleBoardRefChange} />

          <div className="flex-1 flex flex-col gap-2">
            {boardRefFile ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-300">New image selected: {boardRefFile.name}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveBoardRef}
                    disabled={savingBoardRef}
                    className="flex-1 py-2 rounded-lg text-xs font-bold text-black"
                    style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
                  >
                    {savingBoardRef ? 'Saving…' : '✓ Save Reference'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBoardRefFile(null); setBoardRefPreview(''); }}
                    className="px-3 py-2 rounded-lg text-xs text-zinc-500"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => boardRefInputRef.current?.click()}
                  className="w-full py-2 rounded-lg text-xs font-medium text-amber-400"
                  style={{ background: 'rgba(251,191,36,0.08)', border: '1px dashed rgba(251,191,36,0.3)' }}
                >
                  {boardRefItem?.referenceImageUrl ? '🔄 Replace reference image' : '+ Upload board reference image'}
                </button>
                {boardRefItem?.referenceImageUrl && (
                  <button type="button" onClick={deleteBoardRef} className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors">
                    Remove
                  </button>
                )}
              </div>
            )}

            {!boardRefItem?.referenceImageUrl && !boardRefPreview && (
              <div className="text-[11px] text-zinc-600 space-y-0.5">
                <p>• Use good diffused lighting (avoid glare)</p>
                <p>• Top-down, board fills the frame</p>
                <p>• All components must be clearly visible</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Component checklist ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Components to verify ({stageItems.filter(i => i.active).length} active)
          </p>
          {stageItems.length > 0 && (
            <div className="text-[11px] text-zinc-600">
              Total expected: {stageItems.reduce((sum, i) => sum + (i.expectedCount ?? 1), 0)} parts
            </div>
          )}
        </div>

        {stageItems.length === 0 && !showAdd && (
          <div className="card p-6 text-center text-zinc-500 text-sm">
            No components defined yet. Add the components the AI should check.
          </div>
        )}

        {stageItems.map((item) => (
          <div
            key={item.id}
            className="card p-4 flex items-start gap-4"
            style={{ opacity: item.active ? 1 : 0.5 }}
          >
            {/* Reference image */}
            <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {item.referenceImageUrl ? (
                <Image src={item.referenceImageUrl} alt={item.name} width={56} height={56} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{item.name}</span>
                {item.expectedCount && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-sky-400" style={{ background: 'rgba(14,165,233,0.1)' }}>
                    ×{item.expectedCount}
                  </span>
                )}
                {item.required && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>REQUIRED</span>
                )}
                <span className="text-[10px] text-zinc-600">#{item.sortOrder}</span>
              </div>
              {item.boardLocation && (
                <p className="text-[11px] text-sky-400/70 mt-0.5 flex items-center gap-1">
                  <span>📍</span> {zonesToText(parseZoneIds(item.boardLocation)) || item.boardLocation}
                </p>
              )}
              {item.orientationRule && (
                <p className="text-[11px] text-amber-400/70 mt-0.5 flex items-center gap-1">
                  <span>🔄</span> {item.orientationRule}
                </p>
              )}
              {item.description && <p className="text-zinc-500 text-xs mt-0.5">{item.description}</p>}
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

      {/* ── Add component form ────────────────────────────────────────────────── */}
      {showAdd && (
        <form onSubmit={handleAdd} className="card p-4 space-y-4">
          <h3 className="text-sm font-semibold">
            New component — {STAGES.find(s => s.key === activeStage)?.label}
          </h3>
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Component name */}
          <div>
            <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Component name *</label>
            <input
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. MOSFET, SMD Ceramic Cap, 4R7 Resistor"
              className="input-field text-sm"
            />
          </div>

          {/* Count + Required row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">
                Expected count *
              </label>
              <input
                type="number"
                min={1}
                required
                value={form.expectedCount}
                onChange={e => setForm(f => ({ ...f, expectedCount: e.target.value }))}
                placeholder="e.g. 18"
                className="input-field text-sm"
              />
              <p className="text-[10px] text-zinc-600 mt-1">How many on the board?</p>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Sort order</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                className="input-field text-sm"
              />
            </div>
          </div>

          {/* Orientation rule */}
          <div>
            <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">
              Orientation rule
            </label>
            <input
              value={form.orientationRule}
              onChange={e => setForm(f => ({ ...f, orientationRule: e.target.value }))}
              placeholder="e.g. Heatsink tab must face outward from board centre"
              className="input-field text-sm"
            />
            <p className="text-[10px] text-zinc-600 mt-1">AI will verify this — most important for MOSFETs, ICs, diodes</p>
          </div>

          {/* Board location — visual zone picker */}
          <div>
            <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-2">
              Board location
            </label>
            <BoardLocationPicker
              value={form.boardLocation}
              onChange={v => setForm(f => ({ ...f, boardLocation: v }))}
            />
          </div>

          {/* Acceptance criteria */}
          <div>
            <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">
              Additional notes for AI
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. All 18 must be present, pins fully through pads, no physical damage"
              className="input-field text-sm resize-none"
              rows={2}
            />
          </div>

          {/* Required checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="required"
              checked={form.required}
              onChange={e => setForm(f => ({ ...f, required: e.target.checked }))}
              className="w-4 h-4 accent-sky-400"
            />
            <label htmlFor="required" className="text-sm text-zinc-300 cursor-pointer">
              Required — board fails if this component has any issue
            </label>
          </div>

          {/* Component reference image */}
          <div>
            <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">
              Component reference image (optional)
            </label>
            <div
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors"
              style={{ borderColor: previewUrl ? 'rgba(14,165,233,0.4)' : 'rgba(255,255,255,0.1)' }}
            >
              {previewUrl ? (
                <Image src={previewUrl} alt="Preview" width={200} height={120} className="mx-auto rounded-lg object-cover max-h-32" />
              ) : (
                <p className="text-zinc-600 text-sm">Click to upload close-up of this component</p>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="btn-primary flex-1 py-2.5 text-sm">
              {saving ? 'Saving…' : 'Add component'}
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
          + Add component to verify
        </button>
      )}

      {/* Summary card */}
      {stageItems.length > 0 && (
        <div className="card p-4 space-y-2" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">AI Inspection Summary</p>
          <div className="space-y-1">
            {stageItems.filter(i => i.active).map(item => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-300 font-medium">{item.name}</span>
                {item.expectedCount && (
                  <span className="text-sky-400">×{item.expectedCount}</span>
                )}
                {item.boardLocation && (
                  <span className="text-sky-400/60 truncate">📍 {zonesToText(parseZoneIds(item.boardLocation)) || item.boardLocation}</span>
                )}
                {item.orientationRule && (
                  <span className="text-amber-400/60 truncate">🔄 {item.orientationRule}</span>
                )}
                {item.required && (
                  <span className="ml-auto text-[10px] text-red-400 shrink-0">REQUIRED</span>
                )}
              </div>
            ))}
          </div>
          <div className="pt-1 border-t border-zinc-800 flex items-center justify-between text-[11px]">
            <span className="text-zinc-600">Total parts expected per board</span>
            <span className="font-bold text-white">{stageItems.filter(i => i.active).reduce((sum, i) => sum + (i.expectedCount ?? 1), 0)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
