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

type PackingSlipRow = {
  id:           string;
  slipNumber:   string;
  status:       string;
  generatedAt:  string;
  generatedBy:  { name: string };
  packingList:  { id: string; listNumber: string; generatedAt: string } | null;
};

type DispatchOrderFull = {
  id:             string;
  doNumber:       string;
  status:         string;
  totalBoxes:     number | null;
  dispatchQty:    number;
  rejectedReason: string | null;
  orderId:        string;
  order: {
    orderNumber: string;
    quantity:    number;
    client:      { customerName: string } | null;
    product:     { code: string; name: string };
  };
  scans:      StagedScan[];
  boxes:      PackingBoxRow[];
  createdBy:  { name: string };
  invoices?:  { invoiceNumber: string }[];
  packingSlip: PackingSlipRow | null;
};

type InspectedUnit = { id: string; serialNumber: string; finalAssemblyBarcode: string | null };

// ─── Status badge ─────────────────────────────────────────────────────────────
function DOStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    OPEN:        { label: 'Open',        color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'  },
    PACKING:     { label: 'Packing',     color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
    DISPATCHED:  { label: 'Dispatched',  color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
    SUBMITTED:   { label: 'Submitted',   color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
    APPROVED:    { label: 'Approved',    color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
    REJECTED:    { label: 'Rejected',    color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  };
  const c = cfg[status] ?? cfg.OPEN;
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ color: c.color, background: c.bg }}>
      {c.label}
    </span>
  );
}

// ─── Upload helper ────────────────────────────────────────────────────────────
async function uploadPhoto(file: File, type = 'inspection'): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', type);
  const res  = await fetch('/api/shipping/upload', { method: 'POST', body: fd });
  const data = await res.json() as { url?: string };
  return res.ok ? (data.url ?? null) : null;
}

// ─── InspectionStep ───────────────────────────────────────────────────────────
function InspectionStep({
  unit,
  doId,
  onPassStage,
  onCancel,
}: {
  unit:        InspectedUnit;
  doId:        string;
  onPassStage: (scan: StagedScan) => void;
  onCancel:    () => void;
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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handlePass() {
    setPassError('');
    setPassing(true);
    try {
      let inspectionPhotoUrl: string | undefined;
      if (photoFile) {
        setUploading(true);
        const url = await uploadPhoto(photoFile, 'inspection');
        setUploading(false);
        if (url) inspectionPhotoUrl = url;
      }
      const res  = await fetch(`/api/dispatch-orders/${doId}/scans`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ barcode: unit.finalAssemblyBarcode ?? unit.serialNumber, inspectionPhotoUrl }),
      });
      const data = await res.json() as { scan?: StagedScan; error?: string };
      if (!res.ok) { setPassError(data.error ?? 'Failed to stage unit'); return; }
      onPassStage(data.scan!);
    } catch {
      setPassError('Network error');
    } finally {
      setPassing(false);
      setUploading(false);
    }
  }

  async function handleReject() {
    if (!issue.trim()) { setRejectError('Please describe the issue'); return; }
    setRejectError('');
    setRejecting(true);
    try {
      let photoUrl: string | undefined;
      if (photoFile) {
        setUploading(true);
        const url = await uploadPhoto(photoFile, 'inspection');
        setUploading(false);
        if (url) photoUrl = url;
      }
      const res = await fetch(`/api/dispatch-orders/${doId}/reject-scan`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ unitId: unit.id, issue: issue.trim(), photoUrl }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setRejectError(data.error ?? 'Reject failed'); return; }
      onCancel();
    } catch {
      setRejectError('Network error');
    } finally {
      setRejecting(false);
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl p-4 space-y-4" style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.2)' }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-amber-400 mb-0.5">🔍 Inspect Controller</div>
          <div className="font-mono text-sm font-bold text-white">{unit.serialNumber}</div>
          {unit.finalAssemblyBarcode && <div className="text-xs text-zinc-500">{unit.finalAssemblyBarcode}</div>}
        </div>
        <button type="button" onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded">✕ Cancel</button>
      </div>

      <div>
        <input ref={photoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoChange} />
        {photoPreview ? (
          <div className="space-y-2">
            <img src={photoPreview} alt="Controller" className="w-full max-h-52 object-contain rounded-lg border border-zinc-700" />
            <button type="button" onClick={() => photoRef.current?.click()} className="text-xs text-zinc-400 hover:text-white">📷 Retake photo</button>
          </div>
        ) : (
          <button type="button" onClick={() => photoRef.current?.click()}
            className="w-full py-3 rounded-lg text-sm font-medium border-2 border-dashed border-zinc-600 text-zinc-400 hover:border-amber-500 hover:text-amber-400 transition-colors">
            📷 Take photo of controller (optional)
          </button>
        )}
        {uploading && <p className="text-xs text-zinc-500 mt-1">Uploading…</p>}
      </div>

      <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <p className="text-sm text-zinc-300 font-medium">Any marks or dents on this controller?</p>
      </div>

      {showReject && (
        <div className="space-y-2">
          <textarea value={issue} onChange={(e) => setIssue(e.target.value)}
            placeholder="Describe the issue (e.g. dent on top panel, scratch on display…)" rows={3}
            className="input-field text-sm w-full resize-none" autoFocus />
          {rejectError && <p className="text-xs text-rose-400">{rejectError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowReject(false)} className="flex-1 py-2 rounded-lg text-sm text-zinc-400 hover:text-white"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>Back</button>
            <button type="button" onClick={handleReject} disabled={rejecting || !issue.trim()}
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#ef4444' }}>
              {rejecting ? 'Rejecting…' : 'Confirm Reject'}
            </button>
          </div>
        </div>
      )}

      {!showReject && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowReject(true)} className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
            ✗ Yes — Reject
          </button>
          <button type="button" onClick={handlePass} disabled={passing || uploading}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#22c55e' }}>
            {passing ? 'Adding…' : '✓ No — Pass'}
          </button>
        </div>
      )}
      {passError && <p className="text-xs text-rose-400">{passError}</p>}
    </div>
  );
}

// ─── ScanningPhase (OPEN state) ───────────────────────────────────────────────
function ScanningPhase({
  doData,
  boxSizes,
  onScansUpdate,
  onBoxesCreated,
}: {
  doData:         DispatchOrderFull;
  boxSizes:       BoxSizeOption[];
  onScansUpdate:  (scans: StagedScan[]) => void;
  onBoxesCreated: (updated: DispatchOrderFull) => void;
}) {
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [barcode,         setBarcode]         = useState('');
  const [looking,         setLooking]         = useState(false);
  const [lookupError,     setLookupError]     = useState('');
  const [inspecting,      setInspecting]      = useState<InspectedUnit | null>(null);
  const [removing,        setRemoving]        = useState<string | null>(null);
  const [showCreateBoxes, setShowCreateBoxes] = useState(false);
  const [boxCount,        setBoxCount]        = useState('1');
  const [creating,        setCreating]        = useState(false);
  const [createError,     setCreateError]     = useState('');

  const scans = doData.scans;
  const allScanned = doData.dispatchQty > 0 && scans.length === doData.dispatchQty;

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const b = barcode.trim().toUpperCase();
    if (!b) return;
    setLookupError('');
    setLooking(true);
    try {
      const res  = await fetch(
        `/api/dispatch-orders/lookup-unit?barcode=${encodeURIComponent(b)}&orderId=${encodeURIComponent(doData.orderId)}`
      );
      const data = await res.json() as (InspectedUnit & { error?: string });
      if (!res.ok) { setLookupError(data.error ?? 'Unit not found'); return; }
      setInspecting(data);
      setBarcode('');
    } catch {
      setLookupError('Network error');
    } finally {
      setLooking(false);
    }
  }

  function handleInspectionPass(scan: StagedScan) {
    onScansUpdate([...scans, scan]);
    setInspecting(null);
    setTimeout(() => barcodeRef.current?.focus(), 50);
  }

  function handleInspectionCancel() {
    setInspecting(null);
    setTimeout(() => barcodeRef.current?.focus(), 50);
  }

  async function handleRemoveScan(scanId: string) {
    setRemoving(scanId);
    try {
      await fetch(`/api/dispatch-orders/${doData.id}/scans/${scanId}`, { method: 'DELETE' });
      onScansUpdate(scans.filter((s) => s.id !== scanId));
    } catch { /* silent */ }
    finally { setRemoving(null); }
  }

  async function handleCreateBoxes() {
    const n = parseInt(boxCount, 10);
    if (isNaN(n) || n < 1)   { setCreateError('Enter a valid box count'); return; }
    if (n > scans.length)     { setCreateError(`Cannot create ${n} boxes for ${scans.length} unit(s)`); return; }
    setCreateError('');
    setCreating(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doData.id}/create-boxes`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ boxCount: n }),
      });
      const data = await res.json() as (DispatchOrderFull & { error?: string });
      if (!res.ok) { setCreateError(data.error ?? 'Failed to create boxes'); return; }
      onBoxesCreated(data);
    } catch {
      setCreateError('Network error');
    } finally {
      setCreating(false);
    }
  }

  const nBoxes     = parseInt(boxCount, 10);
  const validCount = !isNaN(nBoxes) && nBoxes >= 1 && nBoxes <= scans.length;

  return (
    <div className="space-y-4">
      {/* Scan card */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-zinc-300">
            Step 1 — Scan controllers for this dispatch order
          </div>
          {doData.dispatchQty > 0 && (
            <span className={`text-xs font-semibold ml-auto px-2 py-0.5 rounded ${allScanned ? 'text-green-400 bg-green-500/10' : 'text-zinc-400'}`}>
              {scans.length} / {doData.dispatchQty}
            </span>
          )}
        </div>

        {inspecting ? (
          <InspectionStep
            unit={inspecting}
            doId={doData.id}
            onPassStage={handleInspectionPass}
            onCancel={handleInspectionCancel}
          />
        ) : (
          <>
            <form onSubmit={handleScan} className="flex gap-2">
              <input
                ref={barcodeRef}
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan barcode or serial number…"
                className="input-field text-sm font-mono flex-1"
                autoComplete="off"
                spellCheck={false}
                disabled={looking}
                autoFocus
              />
              <button type="submit" disabled={looking || !barcode.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: '#0ea5e9', color: '#fff' }}>
                {looking ? '…' : 'Scan'}
              </button>
            </form>
            {lookupError && <p className="text-xs text-rose-400">{lookupError}</p>}
          </>
        )}

        {/* Staged list */}
        {scans.length > 0 && (
          <div className="space-y-1.5">
            {scans.map((scan) => (
              <div key={scan.id} className="flex items-center justify-between rounded-lg px-3 py-2"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <div>
                  <div className="font-mono text-sm text-white">{scan.unit.serialNumber}</div>
                  <div className="text-[11px] text-zinc-500">{scan.barcode}</div>
                </div>
                <button type="button" onClick={() => handleRemoveScan(scan.id)} disabled={removing === scan.id}
                  className="text-xs text-zinc-500 hover:text-rose-400 px-1.5 py-0.5 rounded transition-colors">
                  {removing === scan.id ? '…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}

        {allScanned && scans.length > 0 && (
          <div className="text-xs font-semibold text-green-400 text-center py-1">
            ✓ All {doData.dispatchQty} units scanned — proceed to create boxes
          </div>
        )}
      </div>

      {/* Create boxes card — only when all required units are scanned */}
      {allScanned && (
        <div className="card p-4 space-y-3">
          <div className="text-sm font-semibold text-zinc-300">Step 2 — Create boxes</div>
          <p className="text-xs text-zinc-500">
            {scans.length} unit{scans.length !== 1 ? 's' : ''} ready. How many boxes to split them into?
          </p>

          {!showCreateBoxes ? (
            <button type="button" onClick={() => setShowCreateBoxes(true)}
              className="w-full py-2.5 rounded-lg text-sm font-semibold"
              style={{ background: '#0ea5e9', color: '#fff' }}>
              Create Boxes →
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="text-[11px] text-zinc-500 mb-1 block">Number of boxes</label>
                  <input
                    type="number" min="1" max={scans.length} value={boxCount}
                    onChange={(e) => setBoxCount(e.target.value)}
                    className="input-field text-sm w-full" autoFocus
                  />
                </div>
                {validCount && (
                  <div className="text-xs text-zinc-500 pb-2">
                    ≈ {Math.ceil(scans.length / nBoxes)} unit{Math.ceil(scans.length / nBoxes) !== 1 ? 's' : ''}/box
                  </div>
                )}
              </div>

              {validCount && (() => {
                const base = Math.floor(scans.length / nBoxes);
                const rem  = scans.length % nBoxes;
                return (
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: nBoxes }, (_, i) => {
                      const count = base + (i < rem ? 1 : 0);
                      return (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded font-mono"
                          style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
                          Box {i + 1}: {count}
                        </span>
                      );
                    })}
                  </div>
                );
              })()}

              {createError && <p className="text-xs text-rose-400">{createError}</p>}

              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCreateBoxes(false)}
                  className="flex-1 py-2 rounded-lg text-sm text-zinc-400 hover:text-white"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Back
                </button>
                <button type="button" onClick={handleCreateBoxes} disabled={creating || !validCount}
                  className="flex-[2] px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: '#22c55e' }}>
                  {creating ? 'Creating…' : `Confirm — ${nBoxes || '?'} Box${nBoxes === 1 ? '' : 'es'}`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BoxCard (DISPATCHED / PACKING state) ─────────────────────────────────────
function BoxCard({
  box,
  doId,
  boxSizes,
  onBoxUpdate,
}: {
  box:         PackingBoxRow;
  doId:        string;
  boxSizes:    BoxSizeOption[];
  onBoxUpdate: (updated: PackingBoxRow) => void;
}) {
  const [labelInput,    setLabelInput]    = useState('');
  const [verifying,     setVerifying]     = useState(false);
  const [labelError,    setLabelError]    = useState('');
  const [weightInput,   setWeightInput]   = useState(box.weightKg?.toString() ?? '');
  const [sizeId,        setSizeId]        = useState(box.boxSizeId ?? '');
  const [confirming,    setConfirming]    = useState(false);
  const [confirmError,  setConfirmError]  = useState('');
  const [editingWeight, setEditingWeight] = useState(false);
  const [editWeight,    setEditWeight]    = useState(box.weightKg?.toString() ?? '');
  const [editSizeId,    setEditSizeId]    = useState(box.boxSizeId ?? '');
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState('');

  const selectedSize = boxSizes.find((s) => s.id === sizeId);

  async function handleVerifyLabel(e: React.FormEvent) {
    e.preventDefault();
    const label = labelInput.trim().toUpperCase();
    if (!label) return;
    setLabelError('');
    setVerifying(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}/verify-label`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ scannedLabel: label }),
      });
      const data = await res.json() as { labelScanned?: boolean; error?: string };
      if (!res.ok) { setLabelError(data.error ?? 'Label verification failed'); return; }
      onBoxUpdate({ ...box, labelScanned: true });
      setLabelInput('');
    } catch {
      setLabelError('Network error');
    } finally {
      setVerifying(false);
    }
  }

  async function handleConfirm() {
    const w = parseFloat(weightInput);
    if (isNaN(w) || w <= 0) { setConfirmError('Enter a valid weight'); return; }
    if (!sizeId)              { setConfirmError('Select a box size'); return; }
    setConfirmError('');
    setConfirming(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}/confirm`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ weightKg: w, boxSizeId: sizeId }),
      });
      const data = await res.json() as { box?: PackingBoxRow; error?: string };
      if (!res.ok) { setConfirmError(data.error ?? 'Failed to confirm box'); return; }
      onBoxUpdate({ ...box, ...data.box! });
    } catch {
      setConfirmError('Network error');
    } finally {
      setConfirming(false);
    }
  }

  async function handleSaveEdit() {
    const w = parseFloat(editWeight);
    if (isNaN(w) || w <= 0) { setSaveError('Enter a valid weight'); return; }
    if (!editSizeId)          { setSaveError('Select a box size'); return; }
    setSaveError('');
    setSaving(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}/confirm`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ weightKg: w, boxSizeId: editSizeId }),
      });
      const data = await res.json() as { box?: PackingBoxRow; error?: string };
      if (!res.ok) { setSaveError(data.error ?? 'Save failed'); return; }
      onBoxUpdate({ ...box, ...data.box!, isSealed: true });
      setEditingWeight(false);
    } catch {
      setSaveError('Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4 space-y-3">
      {/* Box header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <span className="text-sm font-semibold text-white">Box {box.boxNumber}</span>
          <span className="ml-2 font-mono text-xs text-zinc-400">{box.boxLabel}</span>
        </div>
        {box.isSealed ? (
          <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs px-2 py-0.5 rounded">Confirmed ✓</span>
        ) : box.labelScanned ? (
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>Label ✓</span>
        ) : (
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>Pending</span>
        )}
      </div>

      {/* Items */}
      {box.items.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-zinc-500 font-semibold">{box.items.length} unit{box.items.length !== 1 ? 's' : ''}</div>
          <div className="flex flex-wrap gap-1">
            {box.items.map((item) => (
              <span key={item.id} className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>
                {item.unit.serialNumber}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Confirmed: show summary + edit option */}
      {box.isSealed ? (
        <div className="space-y-2">
          {editingWeight ? (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[100px]">
                  <label className="text-[11px] text-zinc-500 mb-1 block">Weight (kg)</label>
                  <input type="number" step="0.1" min="0.1" value={editWeight}
                    onChange={(e) => setEditWeight(e.target.value)} className="input-field text-sm w-full" autoFocus />
                </div>
                <div className="flex-[2] min-w-[160px]">
                  <label className="text-[11px] text-zinc-500 mb-1 block">Box Size</label>
                  <select value={editSizeId} onChange={(e) => setEditSizeId(e.target.value)} className="input-field text-sm w-full">
                    <option value="">— Select size —</option>
                    {boxSizes.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.lengthCm}×{s.widthCm}×{s.heightCm} cm)</option>
                    ))}
                  </select>
                </div>
              </div>
              {saveError && <p className="text-xs text-rose-400">{saveError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditingWeight(false)} className="flex-1 py-2 rounded-lg text-sm text-zinc-400 hover:text-white"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>Cancel</button>
                <button type="button" onClick={handleSaveEdit} disabled={saving}
                  className="flex-[2] py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: '#0ea5e9' }}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs text-zinc-400 flex gap-3 flex-wrap">
                {box.weightKg && <span>⚖ {box.weightKg} kg</span>}
                {box.boxSize  && <span>📦 {box.boxSize.name} ({box.boxSize.lengthCm}×{box.boxSize.widthCm}×{box.boxSize.heightCm} cm)</span>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <a href={`/print/box-label/${box.id}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
                  🖨 Print Box Label
                </a>
                <button type="button" onClick={() => { setEditingWeight(true); setEditWeight(box.weightKg?.toString() ?? ''); setEditSizeId(box.boxSizeId ?? ''); }}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.04)', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.08)' }}>
                  ✏ Edit
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Step A: Print label */}
          <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="text-xs font-semibold text-zinc-400">① Print box label</div>
            <a href={`/print/box-label/${box.id}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
              🖨 Print Box Label
            </a>
            <p className="text-[10px] text-zinc-600">Pack the controllers into the box and attach the printed label.</p>
          </div>

          {/* Step B: Scan label */}
          <div className="rounded-lg p-3 space-y-2" style={{ background: box.labelScanned ? 'rgba(34,197,94,0.04)' : 'rgba(255,255,255,0.03)', border: `1px solid ${box.labelScanned ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)'}` }}>
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
              <span>② Scan label to verify</span>
              {box.labelScanned && <span className="text-green-400">✓ Done</span>}
            </div>
            {!box.labelScanned ? (
              <>
                <form onSubmit={handleVerifyLabel} className="flex gap-2">
                  <input value={labelInput} onChange={(e) => setLabelInput(e.target.value)}
                    placeholder={box.boxLabel} className="input-field text-xs font-mono flex-1"
                    autoComplete="off" spellCheck={false} disabled={verifying} />
                  <button type="submit" disabled={verifying || !labelInput.trim()}
                    className="px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
                    style={{ background: '#0ea5e9', color: '#fff' }}>
                    {verifying ? '…' : 'Verify'}
                  </button>
                </form>
                {labelError && <p className="text-xs text-rose-400">{labelError}</p>}
              </>
            ) : (
              <div className="text-xs text-green-400">Label verified ✓</div>
            )}
          </div>

          {/* Step C: Weight + size + confirm */}
          {box.labelScanned && (
            <div className="rounded-lg p-3 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-xs font-semibold text-zinc-400">③ Enter box details &amp; confirm</div>
              <div className="flex gap-2 flex-wrap">
                <div className="flex-1 min-w-[100px]">
                  <label className="text-[11px] text-zinc-500 mb-1 block">Weight (kg)</label>
                  <input type="number" step="0.1" min="0.1" value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)} placeholder="0.0" className="input-field text-sm w-full" />
                </div>
                <div className="flex-[2] min-w-[160px]">
                  <label className="text-[11px] text-zinc-500 mb-1 block">Box Size</label>
                  <select value={sizeId} onChange={(e) => setSizeId(e.target.value)} className="input-field text-sm w-full">
                    <option value="">— Select size —</option>
                    {boxSizes.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.lengthCm}×{s.widthCm}×{s.heightCm} cm)</option>
                    ))}
                  </select>
                </div>
              </div>
              {selectedSize && (
                <div className="text-[10px] text-zinc-500 flex gap-3">
                  <span>L: {selectedSize.lengthCm} cm</span>
                  <span>W: {selectedSize.widthCm} cm</span>
                  <span>H: {selectedSize.heightCm} cm</span>
                </div>
              )}
              {confirmError && <p className="text-xs text-rose-400">{confirmError}</p>}
              <button type="button" onClick={handleConfirm} disabled={confirming || !weightInput || !sizeId}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: '#22c55e' }}>
                {confirming ? 'Confirming…' : '✓ Confirm Box'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PackingSlipPhase (all boxes confirmed, DISPATCHED) ───────────────────────
function PackingSlipPhase({
  doData,
  onSlipGenerated,
  onListGenerated,
}: {
  doData:          DispatchOrderFull;
  onSlipGenerated: (slip: PackingSlipRow) => void;
  onListGenerated: (slip: PackingSlipRow) => void;
}) {
  const [generating,   setGenerating]   = useState(false);
  const [genError,     setGenError]     = useState('');
  const [slipInput,    setSlipInput]    = useState('');
  const [scanning,     setScanning]     = useState(false);
  const [scanError,    setScanError]    = useState('');

  const slip = doData.packingSlip;

  async function handleGenerateSlip() {
    setGenError('');
    setGenerating(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doData.id}/generate-packing-slip`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const data = await res.json() as { packingSlip?: PackingSlipRow; error?: string };
      if (!res.ok) { setGenError(data.error ?? 'Failed to generate packing slip'); return; }
      onSlipGenerated(data.packingSlip!);
    } catch {
      setGenError('Network error');
    } finally {
      setGenerating(false);
    }
  }

  async function handleScanSlip(e: React.FormEvent) {
    e.preventDefault();
    const val = slipInput.trim().toUpperCase();
    if (!val) return;
    setScanError('');
    setScanning(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doData.id}/generate-packing-list`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ slipNumber: val }),
      });
      const data = await res.json() as { packingList?: { id: string; listNumber: string; generatedAt: string }; error?: string };
      if (!res.ok) { setScanError(data.error ?? 'Failed to generate packing list'); return; }
      if (slip) {
        onListGenerated({ ...slip, status: 'SCANNED', packingList: data.packingList! });
      }
    } catch {
      setScanError('Network error');
    } finally {
      setScanning(false);
    }
  }

  // No packing slip yet → generate
  if (!slip) {
    return (
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold text-zinc-300">Step 3 — Generate Packing Slip</div>
        <p className="text-xs text-zinc-500">All boxes confirmed. Generate the packing slip to proceed.</p>
        {genError && <p className="text-xs text-rose-400">{genError}</p>}
        <button type="button" onClick={handleGenerateSlip} disabled={generating}
          className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: '#8b5cf6' }}>
          {generating ? 'Generating…' : '📄 Generate Packing Slip'}
        </button>
      </div>
    );
  }

  // Packing slip exists but no packing list → show slip + scan
  if (!slip.packingList) {
    return (
      <div className="space-y-3">
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-violet-400 mb-0.5">Packing Slip Generated ✓</div>
              <div className="font-mono text-sm font-bold text-white">{slip.slipNumber}</div>
              <div className="text-xs text-zinc-500 mt-0.5">Packed by {slip.generatedBy.name}</div>
            </div>
            <a href={`/print/packing-slip/${slip.id}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.2)' }}>
              🖨 Print Packing Slip
            </a>
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <div className="text-sm font-semibold text-zinc-300">Step 4 — Scan Packing Slip to Generate Packing List</div>
          <p className="text-xs text-zinc-500">Print the packing slip, then scan the barcode on it to generate the packing list for accounts.</p>
          <form onSubmit={handleScanSlip} className="flex gap-2">
            <input
              value={slipInput}
              onChange={(e) => setSlipInput(e.target.value)}
              placeholder={`Scan packing slip barcode (${slip.slipNumber})…`}
              className="input-field text-sm font-mono flex-1"
              autoComplete="off"
              spellCheck={false}
              disabled={scanning}
              autoFocus
            />
            <button type="submit" disabled={scanning || !slipInput.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: '#8b5cf6', color: '#fff' }}>
              {scanning ? '…' : 'Scan'}
            </button>
          </form>
          {scanError && <p className="text-xs text-rose-400">{scanError}</p>}
        </div>
      </div>
    );
  }

  // Both packing slip and packing list exist → done!
  return (
    <div className="space-y-3">
      <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
        <div className="text-sm font-semibold text-green-400">Packing Complete ✓</div>
        <div className="text-xs text-zinc-400">
          Packing Slip: <span className="font-mono font-semibold text-zinc-300">{slip.slipNumber}</span>
          {' · '}
          Packing List: <span className="font-mono font-semibold text-zinc-300">{slip.packingList.listNumber}</span>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <a href={`/print/packing-slip/${slip.id}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 text-center py-2 rounded-lg text-xs font-semibold"
          style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.2)' }}>
          🖨 Packing Slip
        </a>
        <a href={`/print/packing-list-doc/${slip.packingList.id}`} target="_blank" rel="noopener noreferrer"
          className="flex-1 text-center py-2 rounded-lg text-xs font-semibold"
          style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
          🖨 Packing List
        </a>
      </div>
    </div>
  );
}

// ─── ReadOnlyBoxList ──────────────────────────────────────────────────────────
function ReadOnlyBoxList({ boxes, doId }: { boxes: PackingBoxRow[]; doId: string }) {
  return (
    <div className="flex flex-col gap-4">
      {boxes.map((box) => (
        <div key={box.id} className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="text-sm font-semibold text-white">Box {box.boxNumber}</span>
              <span className="ml-2 font-mono text-xs text-zinc-400">{box.boxLabel}</span>
            </div>
            {box.isSealed && (
              <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs px-2 py-0.5 rounded">Confirmed ✓</span>
            )}
          </div>
          {(box.weightKg || box.boxSize) && (
            <div className="text-xs text-zinc-400 flex gap-3 flex-wrap">
              {box.weightKg && <span>⚖ {box.weightKg} kg</span>}
              {box.boxSize  && <span>📦 {box.boxSize.name} ({box.boxSize.lengthCm}×{box.boxSize.widthCm}×{box.boxSize.heightCm} cm)</span>}
            </div>
          )}
          {box.items.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-zinc-500 font-semibold">{box.items.length} unit{box.items.length !== 1 ? 's' : ''}</div>
              <div className="flex flex-wrap gap-1">
                {box.items.map((item) => (
                  <span key={item.id} className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}>
                    {item.unit.serialNumber}
                  </span>
                ))}
              </div>
            </div>
          )}
          <a href={`/print/box-label/${box.id}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
            🖨 Print Box Label
          </a>
        </div>
      ))}
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
  const router  = useRouter();
  const [doData,      setDOData]     = useState<DispatchOrderFull>(initialDO);
  const [submitting,  setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [resetting,   setResetting]  = useState(false);
  const [resetError,  setResetError] = useState('');

  const confirmedCount = doData.boxes.filter((b) => b.isSealed).length;
  const totalBoxes     = doData.boxes.length;
  const allConfirmed   = totalBoxes > 0 && confirmedCount === totalBoxes;

  function handleBoxUpdate(updated: PackingBoxRow) {
    setDOData((prev) => ({ ...prev, boxes: prev.boxes.map((b) => (b.id === updated.id ? updated : b)) }));
  }

  // Legacy: submit to accounts (PACKING → SUBMITTED)
  async function handleSubmit() {
    setSubmitError('');
    setSubmitting(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doData.id}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setSubmitError(data.error ?? 'Submit failed'); return; }
      router.push('/shipping');
    } catch {
      setSubmitError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPacking() {
    if (!confirm('Reset packing? This will delete all boxes and scans.')) return;
    setResetError('');
    setResetting(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${doData.id}/reset-packing`, { method: 'POST' });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setResetError(data.error ?? 'Reset failed'); return; }
      router.refresh();
    } catch {
      setResetError('Network error');
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.push('/shipping')} className="text-sm text-zinc-400 hover:text-white transition-colors">
          ← Back
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-semibold text-white font-mono">{doData.doNumber}</span>
            <DOStatusBadge status={doData.status} />
            {doData.dispatchQty > 0 && (
              <span className="text-xs text-zinc-500">Dispatch Qty: {doData.dispatchQty}</span>
            )}
          </div>
          <div className="text-sm text-zinc-400 mt-0.5">
            {doData.order.client?.customerName ?? '—'} · Order #{doData.order.orderNumber} · {doData.order.product.name}
          </div>
        </div>
        {/* Reset button for DISPATCHED/PACKING state (no packing slip yet) */}
        {(doData.status === 'DISPATCHED' || doData.status === 'PACKING') && !doData.packingSlip && (
          <button type="button" onClick={handleResetPacking} disabled={resetting}
            className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            {resetting ? 'Resetting…' : '↺ Reset'}
          </button>
        )}
      </div>
      {resetError && <p className="text-xs text-rose-400">{resetError}</p>}

      {/* ── OPEN: scan units ── */}
      {doData.status === 'OPEN' && (
        <ScanningPhase
          doData={doData}
          boxSizes={boxSizes}
          onScansUpdate={(scans) => setDOData((prev) => ({ ...prev, scans }))}
          onBoxesCreated={(updated) => setDOData(updated as DispatchOrderFull)}
        />
      )}

      {/* ── DISPATCHED: box filling → packing slip → packing list (new flow) ── */}
      {doData.status === 'DISPATCHED' && (
        <div className="space-y-4">
          {/* Box status card */}
          {totalBoxes > 0 && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">{confirmedCount} of {totalBoxes} box{totalBoxes !== 1 ? 'es' : ''} confirmed</span>
                {allConfirmed && <span className="text-xs text-green-400 font-semibold">All confirmed ✓</span>}
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${totalBoxes > 0 ? (confirmedCount / totalBoxes) * 100 : 0}%`, background: allConfirmed ? '#22c55e' : '#0ea5e9' }} />
              </div>
            </div>
          )}

          {/* Box cards */}
          <div className="flex flex-col gap-4">
            {doData.boxes.map((box) => (
              <BoxCard key={box.id} box={box} doId={doData.id} boxSizes={boxSizes} onBoxUpdate={handleBoxUpdate} />
            ))}
          </div>

          {/* Packing slip / packing list phase — only when all boxes are confirmed */}
          {allConfirmed && (
            <PackingSlipPhase
              doData={doData}
              onSlipGenerated={(slip) => setDOData((prev) => ({ ...prev, packingSlip: slip }))}
              onListGenerated={(slip) => setDOData((prev) => ({ ...prev, packingSlip: slip }))}
            />
          )}
        </div>
      )}

      {/* ── PACKING (legacy): box filling + old submit flow ── */}
      {doData.status === 'PACKING' && (
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">{confirmedCount} of {totalBoxes} box{totalBoxes !== 1 ? 'es' : ''} confirmed</span>
              {allConfirmed && <span className="text-xs text-green-400 font-semibold">All confirmed ✓</span>}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${totalBoxes > 0 ? (confirmedCount / totalBoxes) * 100 : 0}%`, background: allConfirmed ? '#22c55e' : '#0ea5e9' }} />
            </div>

            {/* Packing slip phase if available */}
            {allConfirmed && (
              <PackingSlipPhase
                doData={doData}
                onSlipGenerated={(slip) => setDOData((prev) => ({ ...prev, packingSlip: slip }))}
                onListGenerated={(slip) => setDOData((prev) => ({ ...prev, packingSlip: slip }))}
              />
            )}

            {/* Legacy submit (only if no packing slip yet) */}
            {!doData.packingSlip && (
              <>
                <button type="button" onClick={handleSubmit} disabled={submitting || !allConfirmed}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                  style={allConfirmed ? { background: '#22c55e', color: '#fff' } : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#71717a' }}>
                  {submitting ? 'Submitting…' : 'Submit to Accounts (Legacy)'}
                </button>
                {submitError && <p className="text-xs text-rose-400">{submitError}</p>}
              </>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {doData.boxes.map((box) => (
              <BoxCard key={box.id} box={box} doId={doData.id} boxSizes={boxSizes} onBoxUpdate={handleBoxUpdate} />
            ))}
          </div>
        </div>
      )}

      {/* ── SUBMITTED (legacy) ── */}
      {doData.status === 'SUBMITTED' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>
            <div className="text-sm font-semibold" style={{ color: '#c4b5fd' }}>
              {canApprove ? 'Submitted — ready for your approval' : 'Submitted — awaiting accounts approval'}
            </div>
            <div className="text-xs text-zinc-400">
              {doData.boxes.reduce((s, b) => s + b.items.length, 0)} unit(s) across {totalBoxes} box{totalBoxes !== 1 ? 'es' : ''}
            </div>
          </div>
          <a href={`/print/packing-list/${doData.id}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}>
            Packing List (Legacy)
          </a>
          <ReadOnlyBoxList boxes={doData.boxes} doId={doData.id} />
        </div>
      )}

      {/* ── APPROVED (legacy) ── */}
      {doData.status === 'APPROVED' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 space-y-1" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div className="text-sm font-semibold text-green-400">Approved ✓</div>
            {doData.invoices && doData.invoices.length > 0 && (
              <div className="text-xs text-zinc-400">
                Invoice{doData.invoices.length > 1 ? 's' : ''}: {doData.invoices.map((i) => i.invoiceNumber).join(', ')}
              </div>
            )}
          </div>
          <a href={`/print/packing-list/${doData.id}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}>
            Packing List (Legacy)
          </a>
          <ReadOnlyBoxList boxes={doData.boxes} doId={doData.id} />
        </div>
      )}

      {/* ── REJECTED (legacy) ── */}
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
