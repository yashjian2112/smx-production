'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BoardLocationPicker, zonesToText, parseZoneIds } from '@/components/BoardLocationPicker';
import { blobImgUrl } from '@/lib/blobUrl';
import type { ScannedComponent } from '@/app/api/admin/checklists/scan/route';

// ── Component preset library ──────────────────────────────────────────────────
// Select a preset → rules auto-fill → just enter quantity
type Preset = {
  id: string;
  emoji: string;
  label: string;
  name: string;
  orientationRule: string;
  description: string;
  required: boolean;
};

const COMPONENT_PRESETS: Preset[] = [
  {
    id: 'mosfet',
    emoji: '⚡',
    label: 'MOSFET',
    name: 'MOSFET',
    orientationRule: 'Heatsink tab must face outward from board centre',
    description: 'Reversed MOSFET destroys the board when powered — check every unit individually',
    required: true,
  },
  {
    id: 'resistor',
    emoji: '▬',
    label: 'Resistor',
    name: 'Resistor',
    orientationRule: '',
    description: 'Verify correct value installed, no physical damage or wrong position',
    required: true,
  },
  {
    id: 'smd-cap',
    emoji: '▪',
    label: 'SMD Cap',
    name: 'SMD Ceramic Capacitor',
    orientationRule: '',
    description: 'All capacitors in strip must be present — no missing, cracked, or tombstoned caps',
    required: true,
  },
  {
    id: 'elec-cap',
    emoji: '🔋',
    label: 'Elec. Cap',
    name: 'Electrolytic Capacitor',
    orientationRule: 'Negative stripe (white band) must match negative pad marking on PCB silkscreen',
    description: 'Polarised component — reversed cap will fail or rupture under power',
    required: true,
  },
  {
    id: 'diode',
    emoji: '▷',
    label: 'Diode',
    name: 'Diode',
    orientationRule: 'Cathode band (silver/grey stripe) must face the direction marked on PCB',
    description: 'Reversed diode causes immediate circuit failure',
    required: true,
  },
  {
    id: 'ic',
    emoji: '▣',
    label: 'IC / Chip',
    name: 'IC',
    orientationRule: 'Pin 1 dot or notch must align with the triangle marker on PCB silkscreen',
    description: 'Reversed IC causes immediate damage — verify pin 1 on every unit',
    required: true,
  },
  {
    id: 'header',
    emoji: '⬛',
    label: 'Header',
    name: 'Header',
    orientationRule: 'Pins must be straight and connector fully seated into PCB',
    description: 'Verify connector is not tilted, missing pins, or partially inserted',
    required: true,
  },
  {
    id: 'bus-bar',
    emoji: '━',
    label: 'Bus Bar',
    name: 'Bus Bar',
    orientationRule: '',
    description: 'Must be completely flat against board surface — not lifted, shifted, or angled',
    required: true,
  },
  {
    id: 'inductor',
    emoji: '〰',
    label: 'Inductor',
    name: 'Inductor',
    orientationRule: '',
    description: 'Verify correct value, fully seated, no physical damage',
    required: true,
  },
  {
    id: 'transformer',
    emoji: '⊞',
    label: 'Transformer',
    name: 'Transformer',
    orientationRule: 'Pin 1 orientation must match triangle/dot marker on PCB silkscreen',
    description: 'Verify seating, orientation, and no bent pins',
    required: true,
  },
  {
    id: 'spacer',
    emoji: '🔩',
    label: 'Spacer',
    name: 'Spacer',
    orientationRule: '',
    description: 'All spacers must be present and properly secured at corners',
    required: false,
  },
  {
    id: 'custom',
    emoji: '✏️',
    label: 'Custom',
    name: '',
    orientationRule: '',
    description: '',
    required: true,
  },
];

const STAGES = [
  { key: 'POWERSTAGE_MANUFACTURING', label: 'Powerstage' },
  { key: 'BRAINBOARD_MANUFACTURING', label: 'Brainboard' },
  { key: 'CONTROLLER_ASSEMBLY',      label: 'Assembly' },
  { key: 'QC_AND_SOFTWARE',          label: 'QC & Software' },
  { key: 'FINAL_ASSEMBLY',           label: 'Final Assembly' },
];

type ChecklistItem = {
  id: string;
  productId: string | null;
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

type Product = { id: string; name: string; code: string };

// null = "Global (all models)" tab
type ProductTab = string | null;

type Props = { initialItems: ChecklistItem[]; products: Product[] };

export function ChecklistAdmin({ initialItems, products }: Props) {
  const [items, setItems]               = useState(initialItems);
  const [activeStage, setActiveStage]   = useState(STAGES[0].key);
  const [activeProduct, setActiveProduct] = useState<ProductTab>(
    products.length === 1 ? products[0].id : null
  );
  const [showAdd, setShowAdd]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  // Board reference image state
  const boardRefInputRef             = useRef<HTMLInputElement>(null);
  const [boardRefFile, setBoardRefFile] = useState<File | null>(null);
  const [boardRefPreview, setBoardRefPreview] = useState('');
  const [savingBoardRef, setSavingBoardRef]   = useState(false);

  // AI scan state
  const [scanning, setScanning]             = useState(false);
  const [scanResults, setScanResults]       = useState<ScannedComponent[] | null>(null);
  const [scanError, setScanError]           = useState('');
  // Per-row editable counts for scan results
  const [scanCounts, setScanCounts]         = useState<Record<number, number>>({});
  const [scanLocations, setScanLocations]   = useState<Record<number, string>>({});
  const [addingAll, setAddingAll]           = useState(false);

  // Component form state
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: '', description: '', required: true, sortOrder: 0,
    expectedCount: '', orientationRule: '', boardLocation: '',
  });
  const [refImage, setRefImage]     = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [showAdvanced, setShowAdvanced]     = useState(false);

  // Items for current stage + current product tab.
  // On a product-specific tab we show:
  //   1. Items specific to that product (productId === activeProduct)
  //   2. Global items (productId === null) shown with a dimmed "Global" badge
  // On the "Global" tab we show only global items (productId === null).
  const stageItems = items.filter((i) =>
    i.stage === activeStage && !i.isBoardReference &&
    (i.productId === activeProduct ||
     (activeProduct !== null && i.productId === null))
  );
  // Board ref: prefer product-specific with image, then any product-specific, then global with image, then global
  // (handles edge case where multiple board refs exist — always show the one with an image)
  const findBoardRef = (pId: string | null) => {
    const matches = items.filter((i) => i.stage === activeStage && i.isBoardReference && i.productId === pId);
    return matches.find((i) => !!i.referenceImageUrl) ?? matches[0];
  };
  const boardRefItem =
    findBoardRef(activeProduct) ??
    (activeProduct !== null ? findBoardRef(null) : undefined);

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

  // Save / replace board reference image for this stage + product
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
      if (activeProduct) fd.append('productId', activeProduct);

      if (boardRefItem) {
        // Update existing board reference
        const res = await fetch(`/api/admin/checklists/${boardRefItem.id}`, { method: 'PATCH', body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? `Failed to save board reference (${res.status})`);
          return;
        }
        const updated = await res.json();
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      } else {
        // Create new board reference item
        const res = await fetch('/api/admin/checklists', { method: 'POST', body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? `Failed to save board reference (${res.status})`);
          return;
        }
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
      fd.append('stage',           activeStage);
      fd.append('name',            form.name);
      fd.append('description',     form.description);
      fd.append('required',        String(form.required));
      fd.append('sortOrder',       String(form.sortOrder));
      fd.append('expectedCount',   form.expectedCount);
      fd.append('orientationRule', form.orientationRule);
      fd.append('boardLocation',   form.boardLocation);
      fd.append('isBoardReference', 'false');
      if (activeProduct) fd.append('productId', activeProduct);
      if (refImage) fd.append('referenceImage', refImage);

      const res = await fetch('/api/admin/checklists', { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Failed to save (${res.status})`);
        return;
      }
      const item = await res.json();
      setItems((prev) => [...prev, item]);
      setShowAdd(false);
      setForm({ name: '', description: '', required: true, sortOrder: 0, expectedCount: '', orientationRule: '', boardLocation: '' });
      setRefImage(null); setPreviewUrl('');
      setSelectedPreset(''); setShowAdvanced(false);
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

  // ── AI board scan ────────────────────────────────────────────────────────────
  async function scanBoard() {
    if (!boardRefItem?.referenceImageUrl) return;
    setScanning(true); setScanError(''); setScanResults(null);
    try {
      const res = await fetch('/api/admin/checklists/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: boardRefItem.referenceImageUrl }),
      });
      const data = await res.json();
      if (!res.ok) { setScanError(data.error ?? 'Scan failed'); return; }
      setScanResults(data.components);
      // Initialise editable counts/locations from AI results
      const counts: Record<number, number> = {};
      const locs: Record<number, string> = {};
      data.components.forEach((c: ScannedComponent, i: number) => {
        counts[i] = c.expectedCount;
        locs[i]   = c.boardLocation;
      });
      setScanCounts(counts);
      setScanLocations(locs);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Scan failed');
    } finally { setScanning(false); }
  }

  async function addAllScanned() {
    if (!scanResults) return;
    setAddingAll(true);
    try {
      const added: ChecklistItem[] = [];
      for (let i = 0; i < scanResults.length; i++) {
        const c = scanResults[i];
        const fd = new FormData();
        fd.append('stage',           activeStage);
        fd.append('name',            c.name);
        fd.append('description',     c.description);
        fd.append('required',        String(c.required));
        fd.append('sortOrder',       String(i));
        fd.append('expectedCount',   String(scanCounts[i] ?? c.expectedCount));
        fd.append('orientationRule', c.orientationRule);
        fd.append('boardLocation',   scanLocations[i] ?? c.boardLocation);
        fd.append('isBoardReference', 'false');
        if (activeProduct) fd.append('productId', activeProduct);
        const res = await fetch('/api/admin/checklists', { method: 'POST', body: fd });
        if (res.ok) added.push(await res.json());
      }
      setItems((prev) => [...prev, ...added]);
      setScanResults(null);
    } finally { setAddingAll(false); }
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
          const count  = items.filter((i) => i.stage === s.key && i.active && !i.isBoardReference && (activeProduct ? i.productId === activeProduct : true)).length;
          // Green dot: has board ref for current product OR has a global board ref (inherited)
          const hasRef = items.some((i) =>
            i.stage === s.key && i.isBoardReference && i.referenceImageUrl &&
            (activeProduct ? (i.productId === activeProduct || i.productId === null) : true));
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => { setActiveStage(s.key); setShowAdd(false); setSelectedPreset(''); setShowAdvanced(false); setActiveProduct(products.length === 1 ? products[0].id : null); }}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeStage === s.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              style={activeStage === s.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}
            >
              {hasRef && <span className="text-green-400 text-[10px]">●</span>}
              {s.label} {count > 0 && <span className="opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* ── Product model tabs ───────────────────────────────────────────────── */}
      {products.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Product model</p>
          <div className="flex gap-1 flex-wrap">
            {/* "All models / Global" tab — only show when there are multiple products */}
            {products.length > 1 && (
              <button
                type="button"
                onClick={() => { setActiveProduct(null); setShowAdd(false); setSelectedPreset(''); setShowAdvanced(false); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeProduct === null ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                style={activeProduct === null ? { background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' } : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                🌐 Global (all models)
              </button>
            )}
            {products.map((p) => {
              const hasRef  = items.some((i) => i.stage === activeStage && i.isBoardReference && i.referenceImageUrl && i.productId === p.id);
              const count   = items.filter((i) => i.stage === activeStage && i.active && !i.isBoardReference && i.productId === p.id).length;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setActiveProduct(p.id); setShowAdd(false); setSelectedPreset(''); setShowAdvanced(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeProduct === p.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                  style={activeProduct === p.id ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)' } : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  {hasRef && <span className="text-green-400 text-[9px]">●</span>}
                  SMX{p.code} — {p.name}
                  {count > 0 && <span className="opacity-50">({count})</span>}
                </button>
              );
            })}
          </div>
          {activeProduct === null && products.length > 1 && (
            <p className="text-[10px] text-zinc-600">
              Global items apply to ALL product models. Use this for checks common across every board.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* ── Board Reference Image ─────────────────────────────────────────────── */}
      <div className="card p-4 space-y-3" style={{ border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.03)' }}>
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-base">📸</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-amber-300">Board Reference Image</p>
              {/* Show product badge only when the board ref is product-specific */}
              {activeProduct && boardRefItem?.productId === activeProduct && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}>
                  {products.find(p => p.id === activeProduct)?.name ?? ''}
                </span>
              )}
              {/* Show Global badge when: on Global tab, OR on product tab but using inherited global ref */}
              {(!activeProduct || (activeProduct && boardRefItem?.productId === null)) && products.length > 1 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}>
                  {activeProduct ? '🌐 Inherited from Global' : 'Global'}
                </span>
              )}
            </div>
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
                src={boardRefPreview || blobImgUrl(boardRefItem!.referenceImageUrl)}
                alt="Board reference"
                fill
                unoptimized
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
                {/* AI scan button — only when a reference image is set */}
                {boardRefItem?.referenceImageUrl && (
                  <button
                    type="button"
                    onClick={scanBoard}
                    disabled={scanning}
                    className="w-full py-2 rounded-lg text-xs font-bold transition-all"
                    style={{ background: scanning ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#c084fc' }}
                  >
                    {scanning ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                        Scanning board…
                      </span>
                    ) : '🤖 Auto-detect components with AI'}
                  </button>
                )}
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

      {/* ── AI Scan error ─────────────────────────────────────────────────────── */}
      {scanError && (
        <div className="rounded-xl p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          🤖 Scan error: {scanError}
        </div>
      )}

      {/* ── AI Scan results review panel ──────────────────────────────────────── */}
      {scanResults && (
        <div className="card p-4 space-y-3" style={{ border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.04)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-purple-300">🤖 AI detected {scanResults.length} component types</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Review counts and locations, then add all to the checklist.</p>
            </div>
            <button type="button" onClick={() => setScanResults(null)} className="text-zinc-600 hover:text-zinc-400 text-lg leading-none">×</button>
          </div>

          <div className="space-y-2">
            {scanResults.map((c, i) => {
              const preset = COMPONENT_PRESETS.find(p => p.id === c.presetId);
              return (
                <div key={i} className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.12)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{preset?.emoji ?? '🔧'}</span>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-zinc-200">{c.name}</p>
                      {c.orientationRule && <p className="text-[10px] text-amber-400/70 mt-0.5">🔄 {c.orientationRule}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-600 mb-1">Quantity</label>
                      <input
                        type="number" min={1}
                        value={scanCounts[i] ?? c.expectedCount}
                        onChange={e => setScanCounts(prev => ({ ...prev, [i]: parseInt(e.target.value) || 1 }))}
                        className="input-field text-xs py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-600 mb-1">Location</label>
                      <input
                        type="text"
                        value={scanLocations[i] ?? c.boardLocation}
                        onChange={e => setScanLocations(prev => ({ ...prev, [i]: e.target.value }))}
                        placeholder="e.g. TL,TR"
                        className="input-field text-xs py-1"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={addAllScanned}
              disabled={addingAll}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: addingAll ? 'rgba(139,92,246,0.4)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)', border: '1px solid rgba(139,92,246,0.4)' }}
            >
              {addingAll ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Adding…
                </span>
              ) : `✓ Add all ${scanResults.length} components to checklist`}
            </button>
            <button
              type="button"
              onClick={() => setScanResults(null)}
              className="px-4 py-2.5 rounded-xl text-sm text-zinc-500"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

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
          <div className="card p-6 text-center space-y-1">
            <p className="text-zinc-500 text-sm">No components defined yet for this model.</p>
            {activeProduct === null && products.length > 1 && (
              <p className="text-zinc-600 text-xs">Global components apply to all product models.</p>
            )}
            {activeProduct !== null && (
              <p className="text-zinc-600 text-xs">
                These components are specific to{' '}
                <span className="text-sky-400">{products.find(p => p.id === activeProduct)?.name}</span>.
              </p>
            )}
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
                <Image src={blobImgUrl(item.referenceImageUrl)} alt={item.name} width={56} height={56} unoptimized className="w-full h-full object-cover" />
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
                {/* Show "Global" badge when viewing a product tab but item is inherited from global */}
                {activeProduct !== null && item.productId === null && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-purple-400" style={{ background: 'rgba(168,85,247,0.1)' }}>🌐 Global</span>
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
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              New component — {STAGES.find(s => s.key === activeStage)?.label}
              {activeProduct ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}>
                  {products.find(p => p.id === activeProduct)?.name}
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}>
                  Global
                </span>
              )}
            </h3>
            {selectedPreset && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPreset('');
                  setShowAdvanced(false);
                  setForm({ name: '', description: '', required: true, sortOrder: 0, expectedCount: '', orientationRule: '', boardLocation: '' });
                }}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                ← Change type
              </button>
            )}
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* ── Step 1: Pick component type ──────────────────────────────────── */}
          {!selectedPreset ? (
            <div className="space-y-3">
              <p className="text-[11px] text-zinc-500 uppercase tracking-widest">Pick component type</p>
              <div className="grid grid-cols-4 gap-2">
                {COMPONENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(preset.id);
                      setShowAdvanced(false);
                      setForm(f => ({
                        ...f,
                        name:            preset.name,
                        orientationRule: preset.orientationRule,
                        description:     preset.description,
                        required:        preset.required,
                        expectedCount:   '',   // user must always enter count
                        boardLocation:   '',   // user must always pick location
                      }));
                    }}
                    className="flex flex-col items-center gap-1.5 rounded-xl py-3 px-2 transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <span className="text-xl leading-none">{preset.emoji}</span>
                    <span className="text-[10px] font-semibold text-zinc-400 leading-tight text-center">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Step 2: Simplified form ────────────────────────────────────── */
            <div className="space-y-4">
              {/* Preset header */}
              {selectedPreset !== 'custom' && (() => {
                const preset = COMPONENT_PRESETS.find(p => p.id === selectedPreset)!;
                return (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}
                  >
                    <span className="text-lg">{preset.emoji}</span>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-sky-300">{preset.label} preset loaded</p>
                      {preset.orientationRule && (
                        <p className="text-[10px] text-zinc-500 mt-0.5">🔄 {preset.orientationRule}</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Custom preset name field — shown only for "Custom" */}
              {selectedPreset === 'custom' && (
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Component name *</label>
                  <input
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. MOSFET IRFB4227, 4R7 Resistor, Gate Driver"
                    className="input-field text-sm"
                    autoFocus
                  />
                </div>
              )}

              {/* ── Key fields: count + sort order ───────────────────────────── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">
                    Quantity on board *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.expectedCount}
                    onChange={e => setForm(f => ({ ...f, expectedCount: e.target.value }))}
                    placeholder="e.g. 18"
                    className="input-field text-sm"
                    autoFocus={selectedPreset !== 'custom'}
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">How many on this board?</p>
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

              {/* ── Board location picker ─────────────────────────────────────── */}
              <div>
                <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-2">
                  Board location
                </label>
                <BoardLocationPicker
                  value={form.boardLocation}
                  onChange={v => setForm(f => ({ ...f, boardLocation: v }))}
                />
              </div>

              {/* ── Advanced / override section ───────────────────────────────── */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  Advanced / override rules
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Name override (only for non-custom presets) */}
                    {selectedPreset !== 'custom' && (
                      <div>
                        <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Component name</label>
                        <input
                          value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Override preset name (e.g. MOSFET IRFB4227)"
                          className="input-field text-sm"
                        />
                        <p className="text-[10px] text-zinc-600 mt-1">Leave as-is or add part number for precision</p>
                      </div>
                    )}

                    {/* Orientation rule */}
                    <div>
                      <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Orientation rule</label>
                      <input
                        value={form.orientationRule}
                        onChange={e => setForm(f => ({ ...f, orientationRule: e.target.value }))}
                        placeholder="e.g. Heatsink tab must face outward from board centre"
                        className="input-field text-sm"
                      />
                    </div>

                    {/* Additional notes */}
                    <div>
                      <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Additional notes for AI</label>
                      <textarea
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Extra instructions for the AI inspector"
                        className="input-field text-sm resize-none"
                        rows={2}
                      />
                    </div>

                    {/* Required checkbox */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="required-adv"
                        checked={form.required}
                        onChange={e => setForm(f => ({ ...f, required: e.target.checked }))}
                        className="w-4 h-4 accent-sky-400"
                      />
                      <label htmlFor="required-adv" className="text-sm text-zinc-300 cursor-pointer">
                        Required — board fails if any issue found
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
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedPreset && (
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-primary flex-1 py-2.5 text-sm">
                {saving ? 'Saving…' : 'Add component'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setSelectedPreset(''); setShowAdvanced(false); setForm({ name: '', description: '', required: true, sortOrder: 0, expectedCount: '', orientationRule: '', boardLocation: '' }); setRefImage(null); setPreviewUrl(''); }}
                className="btn-ghost px-4 py-2.5 text-sm"
              >
                Cancel
              </button>
            </div>
          )}

          {!selectedPreset && (
            <button
              type="button"
              onClick={() => { setShowAdd(false); setSelectedPreset(''); }}
              className="w-full py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              Cancel
            </button>
          )}
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
