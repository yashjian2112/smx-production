'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────
export type BoxSizeOption = {
  id:       string;
  name:     string;
  lengthCm: number;
  widthCm:  number;
  heightCm: number;
};

type StagedScan = {
  id:      string;
  serial:  string;
  barcode: string;
};

type PackingBoxRow = {
  id:           string;
  boxNumber:    number;
  boxLabel:     string;
  isSealed:     boolean;
  labelScanned: boolean;
  weightKg:     number | null;
  boxSizeId:    string | null;
  boxSize:      BoxSizeOption | null;
  items: { id: string; unit: { serialNumber: string } }[];
};

type DispatchOrderFull = {
  id:             string;
  doNumber:       string;
  status:         string;
  totalBoxes:     number | null;
  rejectedReason: string | null;
  scans:          StagedScan[];
  order: {
    orderNumber: string;
    quantity:    number;
    client:      { customerName: string } | null;
    product:     { code: string; name: string };
  };
  boxes:     PackingBoxRow[];
  createdBy: { name: string };
  invoices?: { invoiceNumber: string }[];
};

type BoxFormEntry = { boxSizeId: string; weightKg: string };

function DOStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    OPEN:      { label: 'Open',      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
    PACKING:   { label: 'Packing',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
    SUBMITTED: { label: 'Submitted', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
    APPROVED:  { label: 'Approved',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
    REJECTED:  { label: 'Rejected',  color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  };
  const c = cfg[status] ?? cfg.OPEN;
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ color: c.color, background: c.bg }}>
      {c.label}
    </span>
  );
}

function PhaseAScan({ doId, orderQty, scans, onScansChange, onNext }: {
  doId: string; orderQty: number; scans: StagedScan[];
  onScansChange: (s: StagedScan[]) => void; onNext: () => void;
}) {
  const [input, setInput]       = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError]       = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const b = input.trim().toUpperCase();
    if (!b) return;
    setError(''); setScanning(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doId}/scans`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barcode: b }) });
      const data = await res.json() as { scan?: StagedScan; serial?: string; error?: string };
      if (!res.ok) { setError(data.error ?? 'Scan failed'); return; }
      onScansChange([...scans, { id: data.scan!.id, serial: data.serial!, barcode: b }]);
      setInput('');
    } catch { setError('Network error'); }
    finally { setScanning(false); inputRef.current?.focus(); }
  }

  async function handleRemove(scanId: string) {
    setRemoving(scanId);
    try {
      const res = await fetch(`/api/dispatch-orders/${doId}/scans/${scanId}`, { method: 'DELETE' });
      if (res.ok) onScansChange(scans.filter((s) => s.id !== scanId));
      else { const d = await res.json() as { error?: string }; setError(d.error ?? 'Remove failed'); }
    } catch { setError('Network error'); }
    finally { setRemoving(null); }
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold text-white">Step 1 — Scan Products</div>
        <div className="text-xs text-zinc-400"><span className="font-semibold text-white">{scans.length}</span> / {orderQty} units scanned</div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (scans.length / orderQty) * 100)}%`, background: scans.length >= orderQty ? '#22c55e' : '#0ea5e9' }} />
      </div>
      <form onSubmit={handleScan} className="flex gap-2">
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Scan barcode or serial number…" className="input-field text-sm font-mono flex-1" autoComplete="off" spellCheck={false} disabled={scanning} autoFocus />
        <button type="submit" disabled={scanning || !input.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: '#0ea5e9', color: '#fff' }}>{scanning ? '…' : 'Scan'}</button>
      </form>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {scans.length > 0 && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {scans.map((s, idx) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-zinc-600 w-5 text-right">{idx + 1}</span>
                <span className="font-mono text-sm text-white">{s.serial}</span>
              </div>
              <button type="button" onClick={() => handleRemove(s.id)} disabled={removing === s.id} className="text-xs text-zinc-500 hover:text-rose-400 px-1.5 py-0.5 rounded transition-colors">{removing === s.id ? '…' : '✕'}</button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={onNext} disabled={scans.length < orderQty} className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all" style={scans.length >= orderQty ? { background: '#0ea5e9', color: '#fff' } : undefined}>
        {scans.length >= orderQty ? 'Verify with Order →' : `Scan ${orderQty - scans.length} more unit${orderQty - scans.length !== 1 ? 's' : ''} to continue`}
      </button>
    </div>
  );
}

function PhaseBVerify({ orderQty, scans, onBack, onNext }: {
  orderQty: number; scans: StagedScan[]; onBack: () => void; onNext: () => void;
}) {
  const allScanned = scans.length >= orderQty;
  return (
    <div className="card p-4 space-y-4">
      <div className="text-sm font-semibold text-white">Step 2 — Verify with Order</div>
      <div className="flex gap-4">
        <div className="flex-1 rounded-lg p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Order Qty</div>
          <div className="text-2xl font-black text-white">{orderQty}</div>
        </div>
        <div className="flex-1 rounded-lg p-3 text-center" style={{ background: allScanned ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${allScanned ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Scanned</div>
          <div className={`text-2xl font-black ${allScanned ? 'text-green-400' : 'text-rose-400'}`}>{scans.length}</div>
        </div>
      </div>
      <div>
        <div className="text-xs text-zinc-500 mb-2">Units to dispatch:</div>
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
          {scans.map((s) => (
            <span key={s.id} className="font-mono text-[11px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.08)' }}>{s.serial}</span>
          ))}
        </div>
      </div>
      {!allScanned && (
        <div className="rounded-lg p-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
          <div className="text-xs text-rose-400 font-semibold">{orderQty - scans.length} unit{orderQty - scans.length !== 1 ? 's' : ''} missing — all {orderQty} units must be scanned before packing.</div>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}>← Back</button>
        <button type="button" onClick={onNext} disabled={!allScanned} className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all" style={{ background: '#0ea5e9', color: '#fff' }}>Set up Boxes →</button>
      </div>
    </div>
  );
}

function PhaseCBoxSetup({ doId, scans, boxSizes, onBack, onCreated }: {
  doId: string; scans: StagedScan[]; boxSizes: BoxSizeOption[];
  onBack: () => void; onCreated: (boxes: PackingBoxRow[]) => void;
}) {
  const [boxCount, setBoxCount] = useState(1);
  const [boxForms, setBoxForms] = useState<BoxFormEntry[]>([{ boxSizeId: '', weightKg: '' }]);
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');

  function setCount(n: number) {
    const clamped = Math.max(1, Math.min(50, n));
    setBoxCount(clamped);
    setBoxForms((prev) => {
      if (clamped > prev.length) return [...prev, ...Array.from({ length: clamped - prev.length }, () => ({ boxSizeId: '', weightKg: '' }))];
      return prev.slice(0, clamped);
    });
  }
  function updateForm(idx: number, field: keyof BoxFormEntry, value: string) {
    setBoxForms((prev) => prev.map((f, i) => i === idx ? { ...f, [field]: value } : f));
  }

  const base = Math.floor(scans.length / boxCount);
  const rem  = scans.length % boxCount;
  const dist = Array.from({ length: boxCount }, (_, i) => base + (i < rem ? 1 : 0));
  const allValid = boxForms.every((f) => f.boxSizeId && parseFloat(f.weightKg) > 0);

  async function handleCreate() {
    if (!allValid) return;
    setError(''); setCreating(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doId}/create-boxes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boxes: boxForms.map((f) => ({ boxSizeId: f.boxSizeId, weightKg: parseFloat(f.weightKg) })) }) });
      const data = await res.json() as { boxes?: PackingBoxRow[]; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to create boxes'); return; }
      onCreated(data.boxes!);
    } catch { setError('Network error'); }
    finally { setCreating(false); }
  }

  return (
    <div className="card p-4 space-y-4">
      <div className="text-sm font-semibold text-white">Step 3 — Set up Boxes</div>
      <div>
        <div className="text-xs text-zinc-500 mb-2">How many boxes?</div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setCount(boxCount - 1)} disabled={boxCount <= 1} className="w-9 h-9 rounded-lg font-bold text-lg disabled:opacity-30" style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7' }}>−</button>
          <input type="number" min={1} max={50} value={boxCount} onChange={(e) => setCount(parseInt(e.target.value) || 1)} className="input-field text-center font-bold text-lg w-20" />
          <button type="button" onClick={() => setCount(boxCount + 1)} disabled={boxCount >= 50} className="w-9 h-9 rounded-lg font-bold text-lg disabled:opacity-30" style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7' }}>+</button>
          <span className="text-xs text-zinc-500">{scans.length} unit{scans.length !== 1 ? 's' : ''} across {boxCount} box{boxCount !== 1 ? 'es' : ''}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {dist.map((count, i) => (
          <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>Box {i + 1}: {count} unit{count !== 1 ? 's' : ''}</span>
        ))}
      </div>
      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {boxForms.map((form, idx) => (
          <div key={idx} className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-xs font-semibold text-zinc-400">Box {idx + 1} — {dist[idx]} unit{dist[idx] !== 1 ? 's' : ''}</div>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-[2] min-w-[160px]">
                <label className="text-[11px] text-zinc-500 mb-1 block">Box Size</label>
                <select value={form.boxSizeId} onChange={(e) => updateForm(idx, 'boxSizeId', e.target.value)} className="input-field text-sm w-full">
                  <option value="">— Select size —</option>
                  {boxSizes.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.lengthCm}×{s.widthCm}×{s.heightCm} cm)</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[90px]">
                <label className="text-[11px] text-zinc-500 mb-1 block">Weight (kg)</label>
                <input type="number" step="0.1" min="0.1" value={form.weightKg} onChange={(e) => updateForm(idx, 'weightKg', e.target.value)} placeholder="0.0" className="input-field text-sm w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onBack} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}>← Back</button>
        <button type="button" onClick={handleCreate} disabled={creating || !allValid} className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all" style={allValid ? { background: '#22c55e', color: '#fff' } : undefined}>
          {creating ? 'Creating…' : `Create ${boxCount} Box${boxCount !== 1 ? 'es' : ''} & Print Labels`}
        </button>
      </div>
    </div>
  );
}

function BoxScanCard({ box, doId, boxSizes, onUpdate }: { box: PackingBoxRow; doId: string; boxSizes: BoxSizeOption[]; onUpdate: (u: PackingBoxRow) => void }) {
  const [input, setInput]           = useState('');
  const [scanning, setScanning]     = useState(false);
  const [error, setError]           = useState('');
  const [editing, setEditing]       = useState(false);
  const [editSize, setEditSize]     = useState(box.boxSizeId ?? '');
  const [editWeight, setEditWeight] = useState(box.weightKg ? String(box.weightKg) : '');
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState('');

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const b = input.trim().toUpperCase();
    if (!b) return;
    setError(''); setScanning(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}/verify-label`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barcode: b }) });
      const data = await res.json() as { labelScanned?: boolean; error?: string };
      if (!res.ok) { setError(data.error ?? 'Scan failed'); return; }
      onUpdate({ ...box, labelScanned: true, isSealed: true }); setInput('');
    } catch { setError('Network error'); }
    finally { setScanning(false); }
  }

  async function handleSaveEdit() {
    const wt = parseFloat(editWeight);
    if (!editSize || !wt || wt <= 0) { setSaveError('Select a size and enter weight'); return; }
    setSaveError(''); setSaving(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boxSizeId: editSize, weightKg: wt }) });
      const data = await res.json() as { box?: PackingBoxRow; error?: string };
      if (!res.ok) { setSaveError(data.error ?? 'Update failed'); return; }
      onUpdate({ ...box, boxSizeId: editSize, weightKg: wt, boxSize: data.box!.boxSize });
      setEditing(false);
    } catch { setSaveError('Network error'); }
    finally { setSaving(false); }
  }

  return (
    <div className="card p-4 space-y-3" style={box.labelScanned ? { borderColor: 'rgba(34,197,94,0.3)' } : undefined}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <span className="text-sm font-semibold text-white">Box {box.boxNumber}</span>
          <span className="ml-2 font-mono text-xs text-zinc-500">{box.boxLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          {!box.labelScanned && !editing && (
            <button type="button" onClick={() => { setEditSize(box.boxSizeId ?? ''); setEditWeight(box.weightKg ? String(box.weightKg) : ''); setEditing(true); setSaveError(''); }} className="text-xs px-2 py-0.5 rounded transition-colors" style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)' }}>Edit</button>
          )}
          {box.labelScanned
            ? <span className="text-xs font-bold px-2 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">Label Scanned ✓</span>
            : <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>Awaiting Label Scan</span>
          }
        </div>
      </div>

      {editing ? (
        <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex gap-2 flex-wrap">
            <div className="flex-[2] min-w-[160px]">
              <label className="text-[11px] text-zinc-500 mb-1 block">Box Size</label>
              <select value={editSize} onChange={(e) => setEditSize(e.target.value)} className="input-field text-sm w-full">
                <option value="">— Select size —</option>
                {boxSizes.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.lengthCm}×{s.widthCm}×{s.heightCm} cm)</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[90px]">
              <label className="text-[11px] text-zinc-500 mb-1 block">Weight (kg)</label>
              <input type="number" step="0.1" min="0.1" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} placeholder="0.0" className="input-field text-sm w-full" />
            </div>
          </div>
          {saveError && <p className="text-xs text-rose-400">{saveError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)' }}>Cancel</button>
            <button type="button" onClick={handleSaveEdit} disabled={saving} className="px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ background: '#0ea5e9', color: '#fff' }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-400 flex gap-3 flex-wrap">
          {box.weightKg && <span>{box.weightKg} kg</span>}
          {box.boxSize && <span>{box.boxSize.name} ({box.boxSize.lengthCm}×{box.boxSize.widthCm}×{box.boxSize.heightCm} cm)</span>}
          <span>{box.items.length} unit{box.items.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {box.items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {box.items.map((item) => <span key={item.id} className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>{item.unit.serialNumber}</span>)}
        </div>
      )}
      <a href={`/print/box-label/${box.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
        Print Box Label
      </a>
      {!box.labelScanned && (
        <div className="space-y-1">
          <div className="text-xs text-zinc-500">Stick label on box, then scan it here:</div>
          <form onSubmit={handleVerify} className="flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Scan ${box.boxLabel}…`} className="input-field text-sm font-mono flex-1" autoComplete="off" spellCheck={false} disabled={scanning} />
            <button type="submit" disabled={scanning || !input.trim()} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: '#22c55e', color: '#fff' }}>{scanning ? '…' : 'Confirm'}</button>
          </form>
          {error && <p className="text-xs text-rose-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

function ReadOnlyBoxList({ boxes, doId }: { boxes: PackingBoxRow[]; doId: string }) {
  return (
    <div className="flex flex-col gap-4">
      {boxes.map((box) => (
        <div key={box.id} className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div><span className="text-sm font-semibold text-white">Box {box.boxNumber}</span><span className="ml-2 font-mono text-xs text-zinc-400">{box.boxLabel}</span></div>
            <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs px-2 py-0.5 rounded">Sealed ✓</span>
          </div>
          {(box.weightKg || box.boxSize) && (
            <div className="text-xs text-zinc-400 flex gap-3 flex-wrap">
              {box.weightKg && <span>{box.weightKg} kg</span>}
              {box.boxSize && <span>{box.boxSize.name} ({box.boxSize.lengthCm}×{box.boxSize.widthCm}×{box.boxSize.heightCm} cm)</span>}
            </div>
          )}
          {box.items.length > 0 && <div className="flex flex-wrap gap-1">{box.items.map((item) => <span key={item.id} className="font-mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>{item.unit.serialNumber}</span>)}</div>}
          <a href={`/print/box-label/${box.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>Print Box Label</a>
        </div>
      ))}
    </div>
  );
}

export function DOPackingPanel({ do: initialDO, boxSizes, role, canApprove = false }: {
  do: DispatchOrderFull; boxSizes: BoxSizeOption[]; role: string; canApprove?: boolean;
}) {
  const router = useRouter();
  const [doData, setDOData]               = useState<DispatchOrderFull>(initialDO);
  const [scans, setScans]                 = useState<StagedScan[]>(initialDO.scans ?? []);
  const [phase, setPhase]           = useState<'scan' | 'verify' | 'boxes'>('scan');
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [resetting, setResetting]     = useState(false);
  const [resetError, setResetError]   = useState('');

  const isPacking  = doData.status === 'PACKING';
  const allLabeled = isPacking && doData.boxes.length > 0 && doData.boxes.every((b) => b.labelScanned);

  function handleBoxUpdate(updated: PackingBoxRow) {
    setDOData((prev) => ({ ...prev, boxes: prev.boxes.map((b) => b.id === updated.id ? updated : b) }));
  }
  function handleBoxesCreated(boxes: PackingBoxRow[]) {
    setDOData((prev) => ({ ...prev, status: 'PACKING', boxes })); setScans([]);
  }

  async function handleReset() {
    if (!confirm('Reset packing? All boxes and scans will be deleted.')) return;
    setResetError(''); setResetting(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doData.id}/reset-packing`, { method: 'POST' });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setResetError(data.error ?? 'Reset failed'); return; }
      setDOData((prev) => ({ ...prev, status: 'OPEN', boxes: [], totalBoxes: null }));
      setScans([]);
      setPhase('scan');
    } catch { setResetError('Network error'); }
    finally { setResetting(false); }
  }

  async function handleSubmit() {
    setSubmitError(''); setSubmitting(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doData.id}/submit`, { method: 'POST' });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setSubmitError(data.error ?? 'Submit failed'); return; }
      router.push('/shipping');
    } catch { setSubmitError('Network error'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.push('/shipping')} className="text-sm text-zinc-400 hover:text-white transition-colors">← Back</button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-semibold text-white font-mono">{doData.doNumber}</span>
            <DOStatusBadge status={doData.status} />
          </div>
          <div className="text-sm text-zinc-400 mt-0.5">{doData.order.client?.customerName ?? '—'} · Order #{doData.order.orderNumber} · {doData.order.product.name}</div>
        </div>
      </div>

      {doData.status === 'OPEN' && (
        <>
          {phase === 'scan'   && <PhaseAScan doId={doData.id} orderQty={doData.order.quantity} scans={scans} onScansChange={setScans} onNext={() => setPhase('verify')} />}
          {phase === 'verify' && <PhaseBVerify orderQty={doData.order.quantity} scans={scans} onBack={() => setPhase('scan')} onNext={() => setPhase('boxes')} />}
          {phase === 'boxes'  && <PhaseCBoxSetup doId={doData.id} scans={scans} boxSizes={boxSizes} onBack={() => setPhase('verify')} onCreated={handleBoxesCreated} />}
        </>
      )}

      {isPacking && (
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-zinc-400">{doData.boxes.filter((b) => b.labelScanned).length} of {doData.boxes.length} box{doData.boxes.length !== 1 ? 'es' : ''} confirmed</div>
              <div className="flex items-center gap-2">
                <a href={`/print/packing-list/${doData.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}>Packing List</a>
                <button type="button" onClick={handleReset} disabled={resetting} className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>{resetting ? 'Resetting…' : 'Reset Packing'}</button>
              </div>
            </div>
            {resetError && <p className="text-xs text-rose-400">{resetError}</p>}
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${doData.boxes.length > 0 ? (doData.boxes.filter((b) => b.labelScanned).length / doData.boxes.length) * 100 : 0}%`, background: allLabeled ? '#22c55e' : '#0ea5e9' }} />
            </div>
            {submitError && <p className="text-xs text-rose-400">{submitError}</p>}
            <button type="button" onClick={handleSubmit} disabled={submitting || !allLabeled} className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all" style={allLabeled ? { background: '#22c55e', color: '#fff' } : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#71717a' }}>
              {submitting ? 'Submitting…' : 'Submit to Accounts'}
            </button>
            {!allLabeled && <p className="text-xs text-zinc-600 text-center">Print labels → stick on boxes → scan each label to confirm</p>}
          </div>
          <div className="flex flex-col gap-4">
            {doData.boxes.map((box) => <BoxScanCard key={box.id} box={box} doId={doData.id} boxSizes={boxSizes} onUpdate={handleBoxUpdate} />)}
          </div>
        </div>
      )}

      {doData.status === 'SUBMITTED' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>
            <div className="text-sm font-semibold" style={{ color: '#c4b5fd' }}>{canApprove ? 'Submitted — ready for your approval' : 'Submitted — awaiting accounts approval'}</div>
            <div className="text-xs text-zinc-400">{doData.boxes.reduce((s, b) => s + b.items.length, 0)} units across {doData.boxes.length} box{doData.boxes.length !== 1 ? 'es' : ''}</div>
          </div>
          <a href={`/print/packing-list/${doData.id}`} target="_blank" rel="noopener noreferrer" className="inline-block px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}>Packing List</a>
          <ReadOnlyBoxList boxes={doData.boxes} doId={doData.id} />
        </div>
      )}

      {doData.status === 'APPROVED' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="text-sm font-semibold text-green-400">Approved</div>
            {doData.invoices && doData.invoices.length > 0 && <div className="text-xs text-zinc-400">Invoice{doData.invoices.length > 1 ? 's' : ''}: {doData.invoices.map((i) => i.invoiceNumber).join(', ')}</div>}
          </div>
          <a href={`/print/packing-list/${doData.id}`} target="_blank" rel="noopener noreferrer" className="inline-block px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}>Packing List</a>
          <ReadOnlyBoxList boxes={doData.boxes} doId={doData.id} />
        </div>
      )}

      {doData.status === 'REJECTED' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="text-sm font-semibold text-rose-400">Rejected</div>
            {doData.rejectedReason && <div className="text-xs text-zinc-400">Reason: {doData.rejectedReason}</div>}
          </div>
          <ReadOnlyBoxList boxes={doData.boxes} doId={doData.id} />
        </div>
      )}
    </div>
  );
}
