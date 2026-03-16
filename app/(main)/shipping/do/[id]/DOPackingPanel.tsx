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

type PackingBoxItemRow = {
  id:        string;
  serial:    string;
  barcode:   string;
  scannedAt: string;
  unit:      { serialNumber: string; finalAssemblyBarcode: string | null };
};

type PackingBoxRow = {
  id:        string;
  boxNumber: number;
  boxLabel:  string;
  photoUrl:  string | null;
  isSealed:  boolean;
  weightKg:  number | null;
  boxSizeId: string | null;
  boxSize:   BoxSizeOption | null;
  items:     PackingBoxItemRow[];
};

type DispatchOrderFull = {
  id:             string;
  doNumber:       string;
  status:         string;
  totalBoxes:     number | null;
  rejectedReason: string | null;
  order: {
    orderNumber: string;
    quantity:    number;
    client:      { customerName: string } | null;
    product:     { code: string; name: string };
  };
  boxes:      PackingBoxRow[];
  createdBy:  { name: string };
  invoices?:  { invoiceNumber: string }[];
};

// ─── Status badge ─────────────────────────────────────────────────────────────
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
    <span
      className="text-[11px] font-bold px-2 py-0.5 rounded"
      style={{ color: c.color, background: c.bg }}
    >
      {c.label}
    </span>
  );
}

// ─── BoxCard ──────────────────────────────────────────────────────────────────
function BoxCard({
  box,
  doId,
  doNumber,
  boxSizes,
  onBoxUpdate,
}: {
  box:         PackingBoxRow;
  doId:        string;
  doNumber:    string;
  boxSizes:    BoxSizeOption[];
  onBoxUpdate: (updated: PackingBoxRow) => void;
}) {
  const [barcode, setBarcode]       = useState('');
  const [scanning, setScanning]     = useState(false);
  const [scanError, setScanError]   = useState('');
  const [removing, setRemoving]     = useState<string | null>(null);
  const [sealing, setSealing]       = useState(false);
  const [sealError, setSealError]   = useState('');

  // Box details
  const [weightInput, setWeightInput]   = useState(box.weightKg?.toString() ?? '');
  const [sizeId, setSizeId]             = useState(box.boxSizeId ?? '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailsSaved, setDetailsSaved] = useState(false);

  const barcodeRef = useRef<HTMLInputElement>(null);
  const photoRef   = useRef<HTMLInputElement>(null);

  // Scan a barcode into this box
  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const b = barcode.trim().toUpperCase();
    if (!b) return;
    setScanError('');
    setScanning(true);
    try {
      const res = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}/scan`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ barcode: b }),
      });
      const data = await res.json() as { item?: PackingBoxItemRow; error?: string };
      if (!res.ok) { setScanError(data.error ?? 'Scan failed'); return; }
      onBoxUpdate({ ...box, items: [...box.items, data.item!] });
      setBarcode('');
    } catch {
      setScanError('Network error');
    } finally {
      setScanning(false);
      barcodeRef.current?.focus();
    }
  }

  // Remove an item from this box
  async function removeItem(itemId: string) {
    setRemoving(itemId);
    try {
      const res = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onBoxUpdate({ ...box, items: box.items.filter((i) => i.id !== itemId) });
      } else {
        const data = await res.json() as { error?: string };
        setScanError(data.error ?? 'Failed to remove item');
      }
    } catch {
      setScanError('Network error');
    } finally {
      setRemoving(null);
    }
  }

  // Save box weight + size
  async function handleSaveDetails() {
    setDetailsError('');
    setDetailsSaved(false);
    setSavingDetails(true);
    try {
      const body: { weightKg?: number; boxSizeId?: string | null } = {};
      const w = parseFloat(weightInput);
      if (!isNaN(w) && w > 0) body.weightKg = w;
      body.boxSizeId = sizeId || null;
      const res = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}/details`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json() as { box?: PackingBoxRow; error?: string };
      if (!res.ok) { setDetailsError(data.error ?? 'Failed to save'); return; }
      onBoxUpdate({ ...box, ...data.box! });
      setDetailsSaved(true);
    } catch {
      setDetailsError('Network error');
    } finally {
      setSavingDetails(false);
    }
  }

  // Seal box — triggered when a photo is selected
  async function handleSealPhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSealError('');
    setSealing(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await fetch(`/api/dispatch-orders/${doId}/boxes/${box.id}/seal`, {
        method: 'POST',
        body:   fd,
      });
      const data = await res.json() as { box?: PackingBoxRow; error?: string };
      if (!res.ok) { setSealError(data.error ?? 'Failed to seal box'); return; }
      const updated = data.box!;
      onBoxUpdate({
        ...box,
        isSealed: updated.isSealed ?? true,
        photoUrl: updated.photoUrl ?? null,
        items:    updated.items ?? box.items,
      });
    } catch {
      setSealError('Network error');
    } finally {
      setSealing(false);
      if (photoRef.current) photoRef.current.value = '';
    }
  }

  return (
    <div className="card p-4 space-y-3">
      {/* Box header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <span className="text-sm font-semibold text-white">Box {box.boxNumber}</span>
          <span className="ml-2 font-mono text-sm text-zinc-400">{box.boxLabel}</span>
        </div>
        {box.isSealed ? (
          <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs px-2 py-0.5 rounded">
            Sealed ✓
          </span>
        ) : (
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}
          >
            Open
          </span>
        )}
      </div>

      {/* Sealed state */}
      {box.isSealed ? (
        <div className="space-y-3">
          {/* Photo thumbnail */}
          {box.photoUrl && (
            <a href={box.photoUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={box.photoUrl}
                alt="Box photo"
                className="w-20 h-20 object-cover rounded-lg border border-zinc-700 hover:opacity-80 transition-opacity"
              />
            </a>
          )}
          {/* Box details summary */}
          {(box.weightKg || box.boxSize) && (
            <div className="text-xs text-zinc-400 flex gap-3 flex-wrap">
              {box.weightKg && <span>{box.weightKg} kg</span>}
              {box.boxSize && <span>{box.boxSize.name} ({box.boxSize.lengthCm}×{box.boxSize.widthCm}×{box.boxSize.heightCm} cm)</span>}
            </div>
          )}
          {/* Read-only items */}
          {box.items.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-zinc-500 font-semibold">
                {box.items.length} unit{box.items.length !== 1 ? 's' : ''} in this box
              </div>
              <div className="flex flex-wrap gap-1">
                {box.items.map((item) => (
                  <span
                    key={item.id}
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}
                  >
                    {item.unit.serialNumber}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Print packing slip */}
          <a
            href={`/print/box-label/${box.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}
          >
            Print Packing Slip
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Scan input */}
          <form onSubmit={handleScan} className="flex gap-2">
            <input
              ref={barcodeRef}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Scan barcode or serial…"
              className="input-field text-sm font-mono flex-1"
              autoComplete="off"
              spellCheck={false}
              disabled={scanning}
            />
            <button
              type="submit"
              disabled={scanning || !barcode.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: '#0ea5e9', color: '#fff' }}
            >
              {scanning ? '…' : 'Add'}
            </button>
          </form>

          {scanError && <p className="text-xs text-rose-400">{scanError}</p>}

          {/* Items list */}
          {box.items.length > 0 && (
            <div className="space-y-1.5">
              {box.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div>
                    <div className="font-mono text-sm text-white">{item.unit.serialNumber}</div>
                    <div className="text-[11px] text-zinc-500">{item.barcode}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={removing === item.id}
                    className="text-xs text-zinc-500 hover:text-rose-400 px-1.5 py-0.5 rounded transition-colors"
                  >
                    {removing === item.id ? '…' : 'Remove'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Box details */}
          <div
            className="rounded-lg p-3 space-y-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="text-xs font-semibold text-zinc-400">Box Details</div>
            <div className="flex gap-2 flex-wrap">
              <div className="flex-1 min-w-[100px]">
                <label className="text-[11px] text-zinc-500 mb-1 block">Weight (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={weightInput}
                  onChange={(e) => { setWeightInput(e.target.value); setDetailsSaved(false); }}
                  placeholder="0.0"
                  className="input-field text-sm w-full"
                />
              </div>
              <div className="flex-[2] min-w-[160px]">
                <label className="text-[11px] text-zinc-500 mb-1 block">Box Size</label>
                <select
                  value={sizeId}
                  onChange={(e) => { setSizeId(e.target.value); setDetailsSaved(false); }}
                  className="input-field text-sm w-full"
                >
                  <option value="">— Select size —</option>
                  {boxSizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.lengthCm}×{s.widthCm}×{s.heightCm} cm)
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {detailsError && <p className="text-xs text-rose-400">{detailsError}</p>}
            <button
              type="button"
              onClick={handleSaveDetails}
              disabled={savingDetails}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.06)', color: detailsSaved ? '#4ade80' : '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {savingDetails ? 'Saving…' : detailsSaved ? 'Saved ✓' : 'Save Details'}
            </button>
          </div>

          {/* Seal box */}
          {sealError && <p className="text-xs text-rose-400">{sealError}</p>}
          <div>
            <input
              ref={photoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleSealPhotoSelect}
              disabled={sealing}
            />
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              disabled={sealing || box.items.length === 0}
              className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
              style={{ background: box.items.length > 0 ? '#22c55e' : undefined, color: '#fff' }}
            >
              {sealing ? 'Sealing…' : box.items.length === 0 ? 'Add items to seal' : 'Seal Box (take photo)'}
            </button>
            {box.items.length === 0 && (
              <p className="text-xs text-zinc-600 text-center mt-1">Scan at least one unit before sealing</p>
            )}
          </div>
        </div>
      )}
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
  const [doData, setDOData]           = useState<DispatchOrderFull>(initialDO);
  const [addingBox, setAddingBox]     = useState(false);
  const [addBoxError, setAddBoxError] = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');

  const isActive   = doData.status === 'OPEN' || doData.status === 'PACKING';
  const sealedCount = doData.boxes.filter((b) => b.isSealed).length;
  const totalBoxes  = doData.boxes.length;
  const allSealed   = totalBoxes > 0 && sealedCount === totalBoxes;

  // Update a single box in state
  function handleBoxUpdate(updated: PackingBoxRow) {
    setDOData((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b) => (b.id === updated.id ? updated : b)),
    }));
  }

  // Add a new box dynamically
  async function handleAddBox() {
    setAddBoxError('');
    setAddingBox(true);
    try {
      const res = await fetch(`/api/dispatch-orders/${doData.id}/boxes`, { method: 'POST' });
      const data = await res.json() as { box?: PackingBoxRow; error?: string };
      if (!res.ok) { setAddBoxError(data.error ?? 'Failed to add box'); return; }
      setDOData((prev) => ({
        ...prev,
        status: 'PACKING',
        boxes: [...prev.boxes, data.box!],
      }));
    } catch {
      setAddBoxError('Network error');
    } finally {
      setAddingBox(false);
    }
  }

  // Submit to accounts
  async function handleSubmit() {
    setSubmitError('');
    if (!allSealed) { setSubmitError('Seal all boxes before submitting.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dispatch-orders/${doData.id}/submit`, { method: 'POST' });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setSubmitError(data.error ?? 'Submit failed'); return; }
      router.push('/shipping');
    } catch {
      setSubmitError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push('/shipping')}
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-semibold text-white font-mono">{doData.doNumber}</span>
            <DOStatusBadge status={doData.status} />
          </div>
          <div className="text-sm text-zinc-400 mt-0.5">
            {doData.order.client?.customerName ?? '—'} · Order #{doData.order.orderNumber} · {doData.order.product.name}
          </div>
        </div>
      </div>

      {/* ── OPEN / PACKING STATE ── */}
      {isActive && (
        <div className="space-y-4">
          {/* Add box + progress bar */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="text-sm text-zinc-400">
                {totalBoxes === 0
                  ? 'No boxes yet — add your first box to start packing'
                  : `${sealedCount} of ${totalBoxes} box${totalBoxes !== 1 ? 'es' : ''} sealed`}
              </div>
              <button
                type="button"
                onClick={handleAddBox}
                disabled={addingBox}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
                style={{ background: '#0ea5e9', color: '#fff' }}
              >
                {addingBox ? 'Adding…' : '+ Add Box'}
              </button>
            </div>

            {totalBoxes > 0 && (
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (sealedCount / totalBoxes) * 100)}%`,
                    background: allSealed ? '#22c55e' : '#0ea5e9',
                  }}
                />
              </div>
            )}

            {addBoxError && <p className="text-xs text-rose-400">{addBoxError}</p>}

            {/* Action buttons */}
            {totalBoxes > 0 && (
              <div className="flex gap-2 flex-wrap pt-1">
                <a
                  href={`/print/packing-list/${doData.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center py-2.5 rounded-lg text-sm font-semibold"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  Packing List
                </a>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting || !allSealed}
                  title={!allSealed ? 'Seal all boxes before submitting' : undefined}
                  className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
                  style={allSealed
                    ? { background: '#22c55e', color: '#fff' }
                    : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#71717a' }}
                >
                  {submitting ? 'Submitting…' : 'Submit to Accounts'}
                </button>
              </div>
            )}

            {submitError && <p className="text-xs text-rose-400">{submitError}</p>}
            {totalBoxes > 0 && !allSealed && (
              <p className="text-xs text-zinc-600 text-center">Seal all boxes before submitting</p>
            )}
          </div>

          {/* Box cards */}
          <div className="flex flex-col gap-4">
            {doData.boxes.map((box) => (
              <BoxCard
                key={box.id}
                box={box}
                doId={doData.id}
                doNumber={doData.doNumber}
                boxSizes={boxSizes}
                onBoxUpdate={handleBoxUpdate}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── SUBMITTED STATE ── */}
      {doData.status === 'SUBMITTED' && (
        <div className="space-y-4">
          <div
            className="rounded-xl p-4 space-y-1"
            style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}
          >
            <div className="text-sm font-semibold" style={{ color: '#c4b5fd' }}>
              {canApprove ? 'Submitted — ready for your approval' : 'Submitted — awaiting accounts approval'}
            </div>
            <div className="text-xs text-zinc-400">
              {doData.boxes.reduce((s, b) => s + b.items.length, 0)} unit{doData.boxes.reduce((s, b) => s + b.items.length, 0) !== 1 ? 's' : ''} across {totalBoxes} box{totalBoxes !== 1 ? 'es' : ''}
            </div>
          </div>
          <div className="flex gap-2">
            <a
              href={`/print/packing-list/${doData.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Packing List
            </a>
          </div>
          <ReadOnlyBoxList boxes={doData.boxes} />
        </div>
      )}

      {/* ── APPROVED STATE ── */}
      {doData.status === 'APPROVED' && (
        <div className="space-y-4">
          <div
            className="rounded-xl p-4 space-y-1"
            style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <div className="text-sm font-semibold text-green-400">Approved</div>
            {doData.invoices && doData.invoices.length > 0 && (
              <div className="text-xs text-zinc-400">
                Invoice{doData.invoices.length > 1 ? 's' : ''}: {doData.invoices.map((inv) => inv.invoiceNumber).join(', ')}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <a
              href={`/print/packing-list/${doData.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              Packing List
            </a>
          </div>
          <ReadOnlyBoxList boxes={doData.boxes} />
        </div>
      )}

      {/* ── REJECTED STATE ── */}
      {doData.status === 'REJECTED' && (
        <div className="space-y-4">
          <div
            className="rounded-xl p-4 space-y-1"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <div className="text-sm font-semibold text-rose-400">Rejected</div>
            {doData.rejectedReason && (
              <div className="text-xs text-zinc-400">Reason: {doData.rejectedReason}</div>
            )}
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
    <div className="flex flex-col gap-4">
      {boxes.map((box) => (
        <div key={box.id} className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="text-sm font-semibold text-white">Box {box.boxNumber}</span>
              <span className="ml-2 font-mono text-sm text-zinc-400">{box.boxLabel}</span>
            </div>
            {box.isSealed ? (
              <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs px-2 py-0.5 rounded">
                Sealed ✓
              </span>
            ) : (
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}
              >
                Open
              </span>
            )}
          </div>

          {(box.weightKg || box.boxSize) && (
            <div className="text-xs text-zinc-400 flex gap-3 flex-wrap">
              {box.weightKg && <span>{box.weightKg} kg</span>}
              {box.boxSize && <span>{box.boxSize.name} ({box.boxSize.lengthCm}×{box.boxSize.widthCm}×{box.boxSize.heightCm} cm)</span>}
            </div>
          )}

          {box.photoUrl && (
            <a href={box.photoUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={box.photoUrl}
                alt="Box photo"
                className="w-20 h-20 object-cover rounded-lg border border-zinc-700 hover:opacity-80 transition-opacity"
              />
            </a>
          )}

          {box.items.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-zinc-500 font-semibold">
                {box.items.length} unit{box.items.length !== 1 ? 's' : ''}
              </div>
              <div className="flex flex-wrap gap-1">
                {box.items.map((item) => (
                  <span
                    key={item.id}
                    className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa' }}
                  >
                    {item.unit.serialNumber}
                  </span>
                ))}
              </div>
            </div>
          )}

          <a
            href={`/print/box-label/${box.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}
          >
            Print Packing Slip
          </a>
        </div>
      ))}
    </div>
  );
}
