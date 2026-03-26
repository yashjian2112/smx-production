'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanInput } from '@/components/ScanInput';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Camera, Check, Package, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
export type BoxSizeOption = {
  id:       string;
  name:     string;
  lengthCm: number;
  widthCm:  number;
  heightCm: number;
};

type StagedScan = {
  id:        string;
  serial:    string;
  barcode:   string;
  scannedAt: string;
  unit:      { serialNumber: string; finalAssemblyBarcode: string | null };
};

type PackingBoxItemRow = {
  id:        string;
  serial:    string;
  barcode:   string;
  scannedAt: string;
  unit:      { serialNumber: string; finalAssemblyBarcode: string | null };
};

type PackingBoxRow = {
  id:           string;
  boxNumber:    number;
  boxLabel:     string;
  photoUrl:     string | null;
  isSealed:     boolean;
  labelScanned: boolean;
  weightKg:     number | null;
  boxSizeId:    string | null;
  boxSize:      BoxSizeOption | null;
  items:        PackingBoxItemRow[];
};

type DispatchOrderFull = {
  id:             string;
  doNumber:       string;
  status:         string;
  dispatchQty:    number;
  totalBoxes:     number | null;
  rejectedReason: string | null;
  orderId:        string;
  order: {
    orderNumber: string;
    quantity:    number;
    client:      { customerName: string } | null;
    product:     { code: string; name: string };
  };
  scans:     StagedScan[];
  boxes:     PackingBoxRow[];
  createdBy: { name: string };
  invoices?: { invoiceNumber: string }[];
};

type InspectedUnit = { id: string; serialNumber: string; finalAssemblyBarcode: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────
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

async function uploadPhoto(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', 'inspection');
  const res  = await fetch('/api/shipping/upload', { method: 'POST', body: fd });
  const data = await res.json() as { url?: string };
  return res.ok ? (data.url ?? null) : null;
}

// ─── InspectionStep ───────────────────────────────────────────────────────────
function InspectionStep({
  unit,
  doId,
  onPass,
  onCancel,
}: {
  unit:     InspectedUnit;
  doId:     string;
  onPass:   (scan: StagedScan) => void;
  onCancel: () => void;
}) {
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoFile,    setPhotoFile]    = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploading,    setUploading]    = useState(false);
  const [showReject,   setShowReject]   = useState(false);
  const [issue,        setIssue]        = useState('');
  const [rejecting,    setRejecting]    = useState(false);
  const [rejectError,  setRejectError]  = useState('');
  const [passing,      setPassing]      = useState(false);
  const [passError,    setPassError]    = useState('');

  async function handlePass() {
    setPassError('');
    setPassing(true);
    try {
      let inspectionPhotoUrl: string | undefined;
      if (photoFile) {
        setUploading(true);
        const url = await uploadPhoto(photoFile);
        setUploading(false);
        if (url) inspectionPhotoUrl = url;
      }
      const res = await fetch(`/api/dispatch-orders/${doId}/scans`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: unit.finalAssemblyBarcode ?? unit.serialNumber, inspectionPhotoUrl }),
      });
      const data = await res.json() as { scan?: StagedScan; error?: string };
      if (!res.ok) { setPassError(data.error ?? 'Failed'); return; }
      onPass(data.scan!);
    } catch { setPassError('Network error'); }
    finally { setPassing(false); setUploading(false); }
  }

  async function handleReject() {
    if (!issue.trim()) { setRejectError('Describe the issue'); return; }
    setRejectError('');
    setRejecting(true);
    try {
      let photoUrl: string | undefined;
      if (photoFile) {
        setUploading(true);
        const url = await uploadPhoto(photoFile);
        setUploading(false);
        if (url) photoUrl = url;
      }
      const res = await fetch(`/api/dispatch-orders/${doId}/reject-scan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitId: unit.id, issue: issue.trim(), photoUrl }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setRejectError(data.error ?? 'Reject failed'); return; }
      onCancel();
    } catch { setRejectError('Network error'); }
    finally { setRejecting(false); setUploading(false); }
  }

  return (
    <div className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.2)' }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-amber-400 mb-0.5">🔍 Inspect Controller</div>
          <div className="font-mono text-sm font-bold text-white">{unit.serialNumber}</div>
          {unit.finalAssemblyBarcode && <div className="text-xs text-zinc-500">{unit.finalAssemblyBarcode}</div>}
        </div>
        <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded"><X className="w-4 h-4 mr-1" /> Cancel</button>
      </div>

      <div>
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); } }} />
        {photoPreview ? (
          <div className="space-y-2">
            <img src={photoPreview} alt="Controller" className="w-full max-h-52 object-contain rounded-lg border border-zinc-700" />
            <button onClick={() => photoRef.current?.click()} className="text-xs text-zinc-400 hover:text-white flex items-center"><Camera className="w-4 h-4 mr-1" /> Retake</button>
          </div>
        ) : (
          <button onClick={() => photoRef.current?.click()}
            className="w-full py-3 rounded-lg text-sm font-medium border-2 border-dashed border-zinc-600 text-zinc-400 hover:border-amber-500 hover:text-amber-400 transition-colors flex items-center justify-center">
            <Camera className="w-4 h-4 mr-1" /> Take photo of controller (optional)
          </button>
        )}
        {uploading && <p className="text-xs text-zinc-500 mt-1">Uploading…</p>}
      </div>

      <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <p className="text-sm text-zinc-300 font-medium">Any marks or dents on this controller?</p>
      </div>

      {showReject ? (
        <div className="space-y-2">
          <textarea value={issue} onChange={(e) => setIssue(e.target.value)} rows={3} autoFocus
            placeholder="Describe the issue (e.g. dent on top panel, scratch on display…)"
            className="input-field text-sm w-full resize-none" />
          {rejectError && <p className="text-xs text-rose-400">{rejectError}</p>}
          <div className="flex gap-2">
            <button onClick={() => setShowReject(false)} className="flex-1 py-2 rounded-lg text-sm text-zinc-400 hover:text-white"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>Back</button>
            <button onClick={handleReject} disabled={rejecting || !issue.trim()}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#ef4444' }}>
              {rejecting ? 'Rejecting…' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button onClick={() => setShowReject(true)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
            <X className="w-4 h-4 mr-1" /> Yes — Reject
          </button>
          <button onClick={handlePass} disabled={passing || uploading}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center" style={{ background: '#22c55e' }}>
            {passing ? 'Adding…' : <><Check className="w-4 h-4 mr-1" /> No — Pass</>}
          </button>
        </div>
      )}
      {passError && <p className="text-xs text-rose-400">{passError}</p>}
    </div>
  );
}

// ─── Phase A: Scan ────────────────────────────────────────────────────────────
function PhaseAScan({
  doData,
  onScansUpdate,
  onNext,
}: {
  doData:        DispatchOrderFull;
  onScansUpdate: (scans: StagedScan[]) => void;
  onNext:        () => void;
}) {
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [barcode,     setBarcode]     = useState('');
  const [looking,     setLooking]     = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [inspecting,  setInspecting]  = useState<InspectedUnit | null>(null);
  const [removing,    setRemoving]    = useState<string | null>(null);

  const scans = doData.scans;

  async function doLookup(b: string) {
    if (!b) return;
    setLookupError('');
    setLooking(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/lookup-unit?barcode=${encodeURIComponent(b)}&orderId=${encodeURIComponent(doData.orderId)}`);
      const data = await res.json() as (InspectedUnit & { error?: string });
      if (!res.ok) { setLookupError(data.error ?? 'Unit not found'); return; }
      setInspecting(data);
      setBarcode('');
    } catch { setLookupError('Network error'); }
    finally { setLooking(false); }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    await doLookup(barcode.trim().toUpperCase());
  }

  async function handleRemove(scanId: string) {
    setRemoving(scanId);
    try {
      await fetch(`/api/dispatch-orders/${doData.id}/scans/${scanId}`, { method: 'DELETE' });
      onScansUpdate(scans.filter((s) => s.id !== scanId));
    } catch { /* silent */ }
    finally { setRemoving(null); }
  }

  return (
    <div className="card p-4 space-y-3">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white flex-shrink-0" style={{ background: '#0ea5e9' }}>1</span>
        <span className="text-sm font-semibold text-white">
          Scan {doData.dispatchQty > 0 ? doData.dispatchQty : '…'} controller{doData.dispatchQty !== 1 ? 's' : ''}
        </span>
        <span className={`text-xs font-semibold ml-auto ${doData.dispatchQty > 0 && scans.length === doData.dispatchQty ? 'text-green-400' : 'text-zinc-400'}`}>
          {scans.length}{doData.dispatchQty > 0 ? ` / ${doData.dispatchQty}` : ''}
        </span>
      </div>

      {inspecting ? (
        <InspectionStep
          unit={inspecting}
          doId={doData.id}
          onPass={(scan) => { onScansUpdate([...scans, scan]); setInspecting(null); setTimeout(() => barcodeRef.current?.focus(), 50); }}
          onCancel={() => { setInspecting(null); setTimeout(() => barcodeRef.current?.focus(), 50); }}
        />
      ) : (
        <>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)' }}>
            <ScanInput
              value={barcode}
              onChange={setBarcode}
              onScan={(code) => { doLookup(code); }}
              placeholder="Scan unit barcode…"
              autoFocus
              disabled={looking}
              scannerTitle="Scan Unit Barcode"
              scannerHint="Point at the FA barcode or serial number label"
            />
          </div>
          {lookupError && <p className="text-xs text-rose-400 mt-1">{lookupError}</p>}
        </>
      )}

      {/* Scanned list */}
      {scans.length > 0 && (
        <div className="space-y-1.5">
          {scans.map((scan) => (
            <div key={scan.id} className="flex items-center justify-between rounded-lg px-3 py-2"
              style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
              <div>
                <span className="font-mono text-sm text-white">{scan.unit.serialNumber}</span>
                {scan.unit.finalAssemblyBarcode && (
                  <span className="text-[11px] text-zinc-500 ml-2">{scan.unit.finalAssemblyBarcode}</span>
                )}
              </div>
              <button onClick={() => handleRemove(scan.id)} disabled={removing === scan.id}
                className="text-xs text-zinc-500 hover:text-rose-400 px-1.5 py-0.5 rounded transition-colors">
                {removing === scan.id ? '…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {scans.length > 0 && !inspecting && (
        <div className="space-y-1">
          <button onClick={onNext}
            disabled={scans.length !== doData.dispatchQty}
            className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
            style={scans.length === doData.dispatchQty
              ? { background: '#22c55e', color: '#fff' }
              : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#71717a' }}>
            Verify with Order →
          </button>
          {scans.length !== doData.dispatchQty && (
            <p className="text-xs text-zinc-500 text-center">
              Scan {doData.dispatchQty - scans.length} more unit{doData.dispatchQty - scans.length !== 1 ? 's' : ''} to proceed
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Phase B: Verify ──────────────────────────────────────────────────────────
function PhaseBVerify({
  doData,
  onBack,
  onNext,
}: {
  doData: DispatchOrderFull;
  onBack: () => void;
  onNext: () => void;
}) {
  const scans       = doData.scans;
  const dispatchQty = doData.dispatchQty;

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white flex-shrink-0" style={{ background: '#0ea5e9' }}>2</span>
        <span className="text-sm font-semibold text-white">Verify with dispatch order</span>
      </div>

      {/* Count summary */}
      <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>DO #{doData.doNumber}</span>
          <span>{doData.order.product.code} · {doData.order.product.name}</span>
        </div>
        <div className="flex gap-8">
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">Dispatch Qty</div>
            <div className="text-2xl font-bold text-white">{dispatchQty}</div>
          </div>
          <div>
            <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">Scanned</div>
            <div className="text-2xl font-bold text-green-400">{scans.length}</div>
          </div>
        </div>
        <div className="text-xs text-green-400 font-semibold flex items-center">All {dispatchQty} units scanned <Check className="w-4 h-4 ml-1 inline" /></div>
      </div>

      {/* Serial list */}
      <div>
        <div className="text-xs font-semibold text-zinc-400 mb-2">Scanned serial numbers</div>
        <div className="flex flex-wrap gap-1.5">
          {scans.map((scan) => (
            <span key={scan.id} className="font-mono text-[10px] px-2 py-1 rounded"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#86efac' }}>
              {scan.unit.serialNumber}
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onBack} className="flex-1 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-white"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          ← Back to Scan
        </button>
        <button onClick={onNext}
          className="flex-[2] py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: '#0ea5e9' }}>
          Looks Good — Set Up Boxes →
        </button>
      </div>
    </div>
  );
}

// ─── Phase C: Box Setup ───────────────────────────────────────────────────────
type BoxFormEntry = { boxSizeId: string };

function PhaseCBoxSetup({
  doData,
  boxSizes,
  onBack,
  onCreated,
}: {
  doData:    DispatchOrderFull;
  boxSizes:  BoxSizeOption[];
  onBack:    () => void;
  onCreated: (updated: DispatchOrderFull) => void;
}) {
  const unitCount = doData.scans.length;
  const [boxCount,    setBoxCount]    = useState(1);
  const [boxForms,    setBoxForms]    = useState<BoxFormEntry[]>([{ boxSizeId: '' }]);
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState('');

  function setCount(n: number) {
    const clamped = Math.max(1, Math.min(n, unitCount));
    setBoxCount(clamped);
    setBoxForms((prev) => {
      const copy = [...prev];
      const last = copy[copy.length - 1] ?? { boxSizeId: '' };
      while (copy.length < clamped) copy.push({ boxSizeId: last.boxSizeId });
      return copy.slice(0, clamped);
    });
  }

  function updateForm(idx: number, field: keyof BoxFormEntry, value: string) {
    setBoxForms((prev) => prev.map((f, i) => (i === idx ? { ...f, [field]: value } : f)));
  }

  const base      = Math.floor(unitCount / boxCount);
  const remainder = unitCount % boxCount;

  async function handleCreate() {
    for (let i = 0; i < boxForms.length; i++) {
      const f = boxForms[i];
      if (!f.boxSizeId) { setCreateError(`Select a box size for Box ${i + 1}`); return; }
    }
    setCreateError('');
    setCreating(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doData.id}/create-boxes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxes: boxForms.map((f) => ({ boxSizeId: f.boxSizeId })) }),
      });
      const data = await res.json() as (DispatchOrderFull & { error?: string });
      if (!res.ok) { setCreateError(data.error ?? 'Failed to create boxes'); return; }
      onCreated(data);
    } catch { setCreateError('Network error'); }
    finally { setCreating(false); }
  }

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white flex-shrink-0" style={{ background: '#0ea5e9' }}>3</span>
        <span className="text-sm font-semibold text-white">Set up boxes</span>
        <span className="text-xs text-zinc-500">{unitCount} unit{unitCount !== 1 ? 's' : ''} to pack</span>
      </div>

      {/* Box count stepper */}
      <div>
        <label className="text-[11px] text-zinc-500 mb-2 block">Number of boxes</label>
        <div className="flex items-center gap-3">
          <button onClick={() => setCount(boxCount - 1)} disabled={boxCount <= 1}
            className="w-9 h-9 rounded-lg text-lg font-bold disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#e4e4e7' }}>−</button>
          <span className="text-2xl font-bold text-white w-8 text-center">{boxCount}</span>
          <button onClick={() => setCount(boxCount + 1)} disabled={boxCount >= unitCount}
            className="w-9 h-9 rounded-lg text-lg font-bold disabled:opacity-30"
            style={{ background: 'rgba(255,255,255,0.08)', color: '#e4e4e7' }}>+</button>
          <div className="text-xs text-zinc-500 ml-1">
            ≈ {base}{remainder > 0 ? `–${base + 1}` : ''} unit{base !== 1 || remainder > 0 ? 's' : ''}/box
          </div>
        </div>
      </div>

      {/* Unit distribution preview */}
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: boxCount }, (_, i) => {
          const count = base + (i < remainder ? 1 : 0);
          return (
            <span key={i} className="text-[10px] px-2 py-0.5 rounded font-mono"
              style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
              Box {i + 1}: {count} unit{count !== 1 ? 's' : ''}
            </span>
          );
        })}
      </div>

      {/* Per-box form */}
      <div className="space-y-3">
        {boxForms.map((form, idx) => {
          const selectedSize = boxSizes.find((s) => s.id === form.boxSizeId);
          const count        = base + (idx < remainder ? 1 : 0);
          return (
            <div key={idx} className="rounded-lg p-3 space-y-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="text-xs font-semibold text-zinc-400">
                Box {idx + 1}
                <span className="ml-2 font-normal text-zinc-600">· {count} unit{count !== 1 ? 's' : ''}</span>
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Box Size <span className="text-rose-400">*</span></label>
                <select value={form.boxSizeId} onChange={(e) => updateForm(idx, 'boxSizeId', e.target.value)}
                  className="input-field text-sm w-full">
                  <option value="">— Select size —</option>
                  {boxSizes.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.lengthCm}×{s.widthCm}×{s.heightCm} cm)</option>
                  ))}
                </select>
              </div>
              {selectedSize && (
                <div className="text-[10px] text-zinc-500 pl-1">
                  L {selectedSize.lengthCm} × W {selectedSize.widthCm} × H {selectedSize.heightCm} cm
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-600">Box weight will be entered during packing.</p>

      {createError && <p className="text-xs text-rose-400">{createError}</p>}

      <div className="flex gap-2">
        <button onClick={onBack} className="flex-1 py-2.5 rounded-lg text-sm text-zinc-400 hover:text-white"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          ← Back
        </button>
        <button onClick={handleCreate} disabled={creating}
          className="flex-[2] py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: '#22c55e' }}>
          {creating ? 'Creating…' : <><Check className="w-4 h-4 mr-1" />Create {boxCount} Box{boxCount !== 1 ? 'es' : ''} →</>}
        </button>
      </div>
    </div>
  );
}

// ─── BoxScanCard (PACKING state) ──────────────────────────────────────────────
function BoxScanCard({
  box,
  doId,
  onBoxUpdate,
}: {
  box:         PackingBoxRow;
  doId:        string;
  onBoxUpdate: (b: PackingBoxRow) => void;
}) {
  // Step 1: weight (first entry)
  const [weightInput,  setWeightInput]  = useState(box.weightKg?.toString() ?? '');
  const [savingWeight, setSavingWeight] = useState(false);
  const [weightError,  setWeightError]  = useState('');
  const [weightSaved,  setWeightSaved]  = useState(box.weightKg != null);

  // Step 3: scan label
  const [labelInput,    setLabelInput]    = useState('');
  const [verifying,     setVerifying]     = useState(false);
  const [labelError,    setLabelError]    = useState('');
  const [showLabelScan, setShowLabelScan] = useState(false);

  // Edit weight on confirmed boxes
  const [editingWeight,      setEditingWeight]      = useState(false);
  const [editWeightInput,    setEditWeightInput]    = useState(box.weightKg?.toString() ?? '');
  const [editWeightSaving,   setEditWeightSaving]   = useState(false);
  const [editWeightError,    setEditWeightError]    = useState('');

  async function handleSaveWeight() {
    const w = parseFloat(weightInput);
    if (isNaN(w) || w <= 0) { setWeightError('Enter a valid weight'); return; }
    setWeightError('');
    setSavingWeight(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}/details`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weightKg: w }),
      });
      const data = await res.json() as { box?: PackingBoxRow; error?: string };
      if (!res.ok) { setWeightError(data.error ?? 'Failed to save weight'); return; }
      onBoxUpdate({ ...box, weightKg: w });
      setWeightSaved(true);
    } catch { setWeightError('Network error'); }
    finally { setSavingWeight(false); }
  }

  async function doVerify(v: string) {
    if (!v) return;
    setLabelError('');
    setVerifying(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}/verify-label`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scannedLabel: v }),
      });
      const data = await res.json() as { labelScanned?: boolean; error?: string };
      if (!res.ok) { setLabelError(data.error ?? 'Verification failed'); return; }
      onBoxUpdate({ ...box, weightKg: parseFloat(weightInput) || box.weightKg, labelScanned: true, isSealed: true });
      setLabelInput('');
    } catch { setLabelError('Network error'); }
    finally { setVerifying(false); }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    await doVerify(labelInput.trim().toUpperCase());
  }

  async function handleEditWeight() {
    const w = parseFloat(editWeightInput);
    if (isNaN(w) || w <= 0) { setEditWeightError('Enter a valid weight'); return; }
    setEditWeightError('');
    setEditWeightSaving(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}/details`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weightKg: w }),
      });
      const data = await res.json() as { box?: PackingBoxRow; error?: string };
      if (!res.ok) { setEditWeightError(data.error ?? 'Failed to save weight'); return; }
      onBoxUpdate({ ...box, weightKg: w });
      setEditingWeight(false);
    } catch { setEditWeightError('Network error'); }
    finally { setEditWeightSaving(false); }
  }

  // ── Confirmed state ──────────────────────────────────────────────────────────
  if (box.labelScanned) {
    return (
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <span className="text-sm font-semibold text-white">Box {box.boxNumber}</span>
            <span className="ml-2 font-mono text-xs text-zinc-400">{box.boxLabel}</span>
          </div>
          <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs px-2 py-0.5 rounded flex items-center">Confirmed <Check className="w-4 h-4 ml-1 inline" /></span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
          {box.boxSize && <span className="flex items-center"><Package className="w-4 h-4 mr-1 inline" />{box.boxSize.name} · {box.boxSize.lengthCm}×{box.boxSize.widthCm}×{box.boxSize.heightCm} cm</span>}
          <span>{box.items.length} unit{box.items.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Weight — editable even after confirmation */}
        {editingWeight ? (
          <div className="rounded-lg p-2 space-y-1.5" style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="text-[11px] font-semibold text-amber-400">Edit Box Weight (kg)</div>
            <div className="flex gap-2">
              <input type="number" step="0.01" min="0.01"
                value={editWeightInput} onChange={(e) => setEditWeightInput(e.target.value)}
                className="input-field text-sm flex-1"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleEditWeight(); } }}
              />
              <button onClick={handleEditWeight} disabled={editWeightSaving || !editWeightInput.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                style={{ background: '#f59e0b', color: '#000' }}>
                {editWeightSaving ? '…' : 'Save'}
              </button>
              <button onClick={() => { setEditingWeight(false); setEditWeightError(''); }}
                className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Cancel
              </button>
            </div>
            {editWeightError && <p className="text-xs text-rose-400">{editWeightError}</p>}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-400">⚖ {box.weightKg != null ? `${box.weightKg} kg` : '—'}</span>
            <button onClick={() => { setEditWeightInput(box.weightKg?.toString() ?? ''); setEditingWeight(true); setEditWeightError(''); }}
              className="text-[11px] px-2 py-0.5 rounded transition-colors"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)' }}>
              Edit
            </button>
          </div>
        )}

        {box.items.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {box.items.map((item) => (
              <span key={item.id} className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>
                {item.unit.serialNumber}
              </span>
            ))}
          </div>
        )}
        <a href={`/print/box-label/${box.id}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
          🖨 Print Label
        </a>
      </div>
    );
  }

  // ── Active packing state ─────────────────────────────────────────────────────
  return (
    <div className="card p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <span className="text-sm font-semibold text-white">Box {box.boxNumber}</span>
          <span className="ml-2 font-mono text-xs text-zinc-400">{box.boxLabel}</span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded"
          style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
          {!weightSaved ? 'Enter weight' : 'Pending scan'}
        </span>
      </div>

      {/* Size — read-only */}
      {box.boxSize && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <span className="text-zinc-500 flex items-center"><Package className="w-4 h-4 mr-1 inline" /> Size</span>
          <span className="font-semibold text-white">{box.boxSize.name}</span>
          <span className="text-zinc-500">{box.boxSize.lengthCm} × {box.boxSize.widthCm} × {box.boxSize.heightCm} cm</span>
        </div>
      )}

      {/* Units inside */}
      {box.items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {box.items.map((item) => (
            <span key={item.id} className="font-mono text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>
              {item.unit.serialNumber}
            </span>
          ))}
        </div>
      )}

      {/* ① Weight */}
      <div className="rounded-lg p-3 space-y-2"
        style={weightSaved
          ? { background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.15)' }
          : { background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.25)' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold" style={{ color: weightSaved ? '#4ade80' : '#fbbf24' }}>
            ① Box Weight (kg) <span className="text-rose-400">*</span>
          </span>
          {weightSaved && (
            <button onClick={() => setWeightSaved(false)}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 underline">
              Edit
            </button>
          )}
        </div>
        {weightSaved ? (
          <div className="text-sm font-bold text-white">{weightInput} kg</div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                type="number" step="0.01" min="0.01"
                value={weightInput} onChange={(e) => setWeightInput(e.target.value)}
                placeholder="0.00"
                className="input-field text-sm flex-1"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveWeight(); } }}
              />
              <button onClick={handleSaveWeight} disabled={savingWeight || !weightInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: '#f59e0b', color: '#000' }}>
                {savingWeight ? '…' : 'Save'}
              </button>
            </div>
            {weightError && <p className="text-xs text-rose-400">{weightError}</p>}
          </>
        )}
      </div>

      {/* ② Print label — enabled only after weight saved */}
      <div className="space-y-1.5">
        <div className="text-xs font-semibold text-zinc-400">② Print label &amp; stick on box</div>
        <a href={weightSaved ? `/print/box-label/${box.id}` : '#'}
          target={weightSaved ? '_blank' : undefined}
          rel="noopener noreferrer"
          onClick={(e) => { if (!weightSaved) e.preventDefault(); }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-opacity"
          style={weightSaved
            ? { background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }
            : { background: 'rgba(255,255,255,0.04)', color: '#52525b', border: '1px solid rgba(255,255,255,0.06)', cursor: 'not-allowed' }}>
          🖨 Print Label
        </a>
        {!weightSaved && <p className="text-[11px] text-zinc-600">Save weight first to unlock printing.</p>}
      </div>

      {/* ③ Scan label to confirm — enabled only after weight saved */}
      {showLabelScan && (
        <BarcodeScanner
          title="Scan Box Label"
          hint={`Expected: ${box.boxLabel}`}
          onScan={(code) => { setShowLabelScan(false); doVerify(code); }}
          onClose={() => setShowLabelScan(false)}
        />
      )}
      <div className="rounded-lg p-3 space-y-2"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          opacity: weightSaved ? 1 : 0.4, pointerEvents: weightSaved ? 'auto' : 'none' }}>
        <div className="text-xs font-semibold text-zinc-300">③ Scan label barcode to confirm</div>
        <form onSubmit={handleVerify} className="flex gap-2">
          <button
            type="button"
            onClick={() => weightSaved && setShowLabelScan(true)}
            className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
            style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}
            title="Open camera scanner"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </button>
          <input value={labelInput} onChange={(e) => setLabelInput(e.target.value)}
            placeholder={box.boxLabel}
            className="input-field text-xs font-mono flex-1"
            autoComplete="off" spellCheck={false} disabled={verifying || !weightSaved} />
          <button type="submit" disabled={verifying || !labelInput.trim() || !weightSaved}
            className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
            style={{ background: '#0ea5e9', color: '#fff' }}>
            {verifying ? '…' : 'Verify'}
          </button>
        </form>
        {labelError && <p className="text-xs text-rose-400">{labelError}</p>}
      </div>
    </div>
  );
}

// ─── Main DOPackingPanel ──────────────────────────────────────────────────────
export function DOPackingPanel({
  do: initialDO,
  boxSizes,
  role,
  canApprove = false,
}: {
  do:          DispatchOrderFull;
  boxSizes:    BoxSizeOption[];
  role:        string;
  canApprove?: boolean;
}) {
  const router = useRouter();
  const [doData,        setDOData]       = useState<DispatchOrderFull>(initialDO);
  const [openPhase,     setOpenPhase]    = useState<'scan' | 'verify' | 'boxes'>('scan');
  const [submitting,    setSubmitting]   = useState(false);
  const [submitError,   setSubmitError]  = useState('');
  const [resetting,     setResetting]    = useState(false);
  const [resetError,    setResetError]   = useState('');

  const scannedCount    = doData.boxes.filter((b) => b.labelScanned).length;
  const totalBoxes      = doData.boxes.length;
  const allScanned      = totalBoxes > 0 && scannedCount === totalBoxes;
  const autoOpenedRef   = useRef(false);

  // Auto-open packing list when every box is confirmed
  useEffect(() => {
    if (doData.status === 'PACKING' && allScanned && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      window.open(`/print/packing-list/${doData.id}`, '_blank');
    }
  }, [allScanned, doData.status, doData.id]);

  function handleBoxUpdate(updated: PackingBoxRow) {
    setDOData((prev) => ({ ...prev, boxes: prev.boxes.map((b) => (b.id === updated.id ? updated : b)) }));
  }

  async function handleResetPacking() {
    if (!confirm('Reset packing? All boxes and scans will be deleted. The order will return to OPEN status.')) return;
    setResetError(''); setResetting(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doData.id}/reset-packing`, { method: 'POST' });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setResetError(data.error ?? 'Reset failed'); return; }
      setDOData((prev) => ({ ...prev, status: 'OPEN', boxes: [], totalBoxes: null, scans: [] }));
      setOpenPhase('scan');
    } catch { setResetError('Network error'); }
    finally { setResetting(false); }
  }

  async function handleSubmit() {
    setSubmitError('');
    setSubmitting(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doData.id}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setSubmitError(data.error ?? 'Submit failed'); return; }
      router.push('/shipping');
    } catch { setSubmitError('Network error'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/shipping')} className="text-sm text-zinc-400 hover:text-white transition-colors">← Back</button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-semibold text-white font-mono">{doData.doNumber}</span>
            <DOStatusBadge status={doData.status} />
            {doData.dispatchQty < doData.order.quantity && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ color: '#fb923c', background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.3)' }}>
                PARTIAL · {doData.dispatchQty}/{doData.order.quantity} units
              </span>
            )}
          </div>
          <div className="text-sm text-zinc-400 mt-0.5">
            {doData.order.client?.customerName ?? '—'} · Order #{doData.order.orderNumber} · {doData.order.product.name}
          </div>
        </div>
      </div>

      {/* ── OPEN: 3-phase ── */}
      {doData.status === 'OPEN' && (
        <>
          {openPhase === 'scan' && (
            <PhaseAScan
              doData={doData}
              onScansUpdate={(scans) => setDOData((prev) => ({ ...prev, scans }))}
              onNext={() => setOpenPhase('verify')}
            />
          )}
          {openPhase === 'verify' && (
            <PhaseBVerify
              doData={doData}
              onBack={() => setOpenPhase('scan')}
              onNext={() => setOpenPhase('boxes')}
            />
          )}
          {openPhase === 'boxes' && (
            <PhaseCBoxSetup
              doData={doData}
              boxSizes={boxSizes}
              onBack={() => setOpenPhase('verify')}
              onCreated={(updated) => setDOData(updated as DispatchOrderFull)}
            />
          )}
        </>
      )}

      {/* ── PACKING: print + scan labels ── */}
      {doData.status === 'PACKING' && (
        <div className="space-y-4">
          {/* Progress + submit */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">{scannedCount} of {totalBoxes} label{totalBoxes !== 1 ? 's' : ''} scanned</span>
              {allScanned && <span className="text-xs text-green-400 font-semibold flex items-center">All labels scanned <Check className="w-4 h-4 ml-1 inline" /></span>}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${totalBoxes > 0 ? (scannedCount / totalBoxes) * 100 : 0}%`, background: allScanned ? '#22c55e' : '#0ea5e9' }} />
            </div>
            <div className="flex gap-2 pt-1">
              <a href={`/print/packing-list/${doData.id}`} target="_blank" rel="noopener noreferrer"
                className="text-center py-2.5 px-3 rounded-lg text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}>
                Packing List
              </a>
              <button onClick={handleResetPacking} disabled={resetting}
                className="py-2.5 px-3 rounded-lg text-sm font-semibold disabled:opacity-40 transition-colors"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                {resetting ? 'Resetting…' : 'Reset'}
              </button>
              <button onClick={handleSubmit} disabled={submitting || !allScanned}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
                style={allScanned ? { background: '#22c55e', color: '#fff' } : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#71717a' }}>
                {submitting ? 'Submitting…' : 'Submit to Accounts'}
              </button>
            </div>
            {resetError  && <p className="text-xs text-rose-400">{resetError}</p>}
            {submitError && <p className="text-xs text-rose-400">{submitError}</p>}
            {!allScanned && <p className="text-xs text-zinc-600 text-center">Scan all box labels before submitting</p>}
          </div>

          <div className="flex flex-col gap-4">
            {doData.boxes.map((box) => (
              <BoxScanCard key={box.id} box={box} doId={doData.id} onBoxUpdate={handleBoxUpdate} />
            ))}
          </div>
        </div>
      )}

      {/* ── SUBMITTED ── */}
      {doData.status === 'SUBMITTED' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>
            <div className="text-sm font-semibold" style={{ color: '#c4b5fd' }}>
              {canApprove ? 'Submitted — ready for your approval' : 'Submitted — awaiting accounts approval'}
            </div>
            <div className="text-xs text-zinc-400">
              {doData.boxes.reduce((s, b) => s + b.items.length, 0)} unit(s) · {totalBoxes} box{totalBoxes !== 1 ? 'es' : ''}
            </div>
          </div>
          <a href={`/print/packing-list/${doData.id}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}>
            Packing List
          </a>
          <ReadOnlyBoxList boxes={doData.boxes} />
        </div>
      )}

      {/* ── APPROVED ── */}
      {doData.status === 'APPROVED' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="text-sm font-semibold text-green-400 flex items-center">Approved <Check className="w-4 h-4 ml-1 inline" /></div>
            {doData.invoices && doData.invoices.length > 0 && (
              <div className="text-xs text-zinc-400">Invoice{doData.invoices.length > 1 ? 's' : ''}: {doData.invoices.map((i) => i.invoiceNumber).join(', ')}</div>
            )}
          </div>
          <a href={`/print/packing-list/${doData.id}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}>
            Packing List
          </a>
          <ReadOnlyBoxList boxes={doData.boxes} />
        </div>
      )}

      {/* ── REJECTED ── */}
      {doData.status === 'REJECTED' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="text-sm font-semibold text-rose-400">Rejected</div>
            {doData.rejectedReason && <div className="text-xs text-zinc-400">Reason: {doData.rejectedReason}</div>}
          </div>
          <ReadOnlyBoxList boxes={doData.boxes} />
        </div>
      )}
    </div>
  );
}

// ─── ReadOnlyBoxList ──────────────────────────────────────────────────────────
function ReadOnlyBoxList({ boxes }: { boxes: PackingBoxRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {boxes.map((box) => (
        <div key={box.id} className="card p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="text-sm font-semibold text-white">Box {box.boxNumber}</span>
              <span className="ml-2 font-mono text-xs text-zinc-400">{box.boxLabel}</span>
            </div>
            {box.labelScanned && (
              <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs px-2 py-0.5 rounded flex items-center">Confirmed <Check className="w-4 h-4 ml-1 inline" /></span>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
            {box.weightKg && <span>⚖ {box.weightKg} kg</span>}
            {box.boxSize  && <span className="flex items-center"><Package className="w-4 h-4 mr-1 inline" />{box.boxSize.name} · {box.boxSize.lengthCm}×{box.boxSize.widthCm}×{box.boxSize.heightCm} cm</span>}
          </div>
          {box.items.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {box.items.map((item) => (
                <span key={item.id} className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>
                  {item.unit.serialNumber}
                </span>
              ))}
            </div>
          )}
          <a href={`/print/box-label/${box.id}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
            🖨 Print Packing Slip
          </a>
        </div>
      ))}
    </div>
  );
}
