'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────
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
  items:     PackingBoxItemRow[];
};

type DispatchOrderFull = {
  id:           string;
  doNumber:     string;
  status:       string;
  totalBoxes:   number | null;
  rejectedReason: string | null;
  order: {
    orderNumber: string;
    quantity:    number;
    client:      { customerName: string } | null;
    product:     { code: string; name: string };
  };
  boxes:       PackingBoxRow[];
  createdBy:   { name: string };
  invoices?:   { invoiceNumber: string }[];
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
  totalBoxes,
  onBoxUpdate,
}: {
  box:          PackingBoxRow;
  doId:         string;
  totalBoxes:   number;
  onBoxUpdate:  (updated: PackingBoxRow) => void;
}) {
  const [barcode, setBarcode]     = useState('');
  const [scanning, setScanning]   = useState(false);
  const [scanError, setScanError] = useState('');
  const [removing, setRemoving]   = useState<string | null>(null);
  const [sealing, setSealing]     = useState(false);
  const [sealError, setSealError] = useState('');
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
      if (!res.ok) {
        setScanError(data.error ?? 'Scan failed');
        return;
      }
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
      if (!res.ok) {
        setSealError(data.error ?? 'Failed to seal box');
        return;
      }
      // Merge updated box from server with current items if server doesn't return them
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
          <span className="text-sm font-semibold text-white">
            Box {box.boxNumber} of {totalBoxes}
          </span>
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

          {scanError && (
            <p className="text-xs text-rose-400">{scanError}</p>
          )}

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

          {/* Seal box */}
          {sealError && (
            <p className="text-xs text-rose-400">{sealError}</p>
          )}
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
              {sealing ? 'Sealing…' : box.items.length === 0 ? 'Add items to seal' : `Seal Box (take photo)`}
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
  role,
}: {
  do:   DispatchOrderFull;
  role: string;
}) {
  const router = useRouter();
  const [doData, setDOData] = useState<DispatchOrderFull>(initialDO);

  // OPEN state — declare box count
  const [boxCount, setBoxCount]       = useState(1);
  const [starting, setStarting]       = useState(false);
  const [startError, setStartError]   = useState('');

  // PACKING state — submit
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState('');

  const sealedCount = doData.boxes.filter((b) => b.isSealed).length;
  const totalBoxes  = doData.totalBoxes ?? doData.boxes.length;
  const allSealed   = totalBoxes > 0 && sealedCount === totalBoxes;

  // Update a single box in state
  function handleBoxUpdate(updated: PackingBoxRow) {
    setDOData((prev) => ({
      ...prev,
      boxes: prev.boxes.map((b) => (b.id === updated.id ? updated : b)),
    }));
  }

  // Start packing — PATCH with totalBoxes
  async function handleStartPacking() {
    setStartError('');
    setStarting(true);
    try {
      const res = await fetch(`/api/dispatch-orders/${doData.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ totalBoxes: boxCount }),
      });
      const data = await res.json() as DispatchOrderFull & { error?: string };
      if (!res.ok) {
        setStartError((data as any).error ?? 'Failed to start packing');
        return;
      }
      // Server returns full DO with boxes — serialize dates if needed
      const boxes = (data.boxes ?? []).map((b: any) => ({
        ...b,
        createdAt: typeof b.createdAt === 'string' ? b.createdAt : new Date(b.createdAt).toISOString(),
        items: (b.items ?? []).map((item: any) => ({
          ...item,
          scannedAt: typeof item.scannedAt === 'string' ? item.scannedAt : new Date(item.scannedAt).toISOString(),
        })),
      }));
      setDOData((prev) => ({ ...prev, ...data, boxes }));
    } catch {
      setStartError('Network error');
    } finally {
      setStarting(false);
    }
  }

  // Submit to accounts
  async function handleSubmit() {
    setSubmitError('');
    if (!allSealed) {
      setSubmitError('Seal all boxes before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/dispatch-orders/${doData.id}/submit`, {
        method: 'POST',
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setSubmitError(data.error ?? 'Submit failed');
        return;
      }
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

      {/* ── OPEN STATE ── */}
      {doData.status === 'OPEN' && (
        <div className="card p-4 space-y-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">Start Packing</div>
            <div className="text-xs text-zinc-500">
              Order: {doData.order.quantity} unit{doData.order.quantity !== 1 ? 's' : ''} · {doData.order.product.code} {doData.order.product.name}
            </div>
            <div className="text-xs text-zinc-500">Created by {doData.createdBy.name}</div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-300 font-medium">Number of Boxes</label>
            <input
              type="number"
              min={1}
              max={50}
              value={boxCount}
              onChange={(e) => setBoxCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              className="input-field text-sm w-32"
            />
            <p className="text-xs text-zinc-600">Between 1 and 50 boxes</p>
          </div>

          {startError && <p className="text-xs text-rose-400">{startError}</p>}

          <button
            type="button"
            onClick={handleStartPacking}
            disabled={starting}
            className="btn-primary w-full disabled:opacity-40"
          >
            {starting ? 'Starting…' : `Start Packing (${boxCount} box${boxCount !== 1 ? 'es' : ''})`}
          </button>
        </div>
      )}

      {/* ── PACKING STATE ── */}
      {doData.status === 'PACKING' && (
        <div className="space-y-4">
          {/* Progress + action bar */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Boxes Sealed</span>
              <span className="font-mono font-bold text-white">{sealedCount} / {totalBoxes}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${totalBoxes > 0 ? Math.min(100, (sealedCount / totalBoxes) * 100) : 0}%`,
                  background: allSealed ? '#22c55e' : '#0ea5e9',
                }}
              />
            </div>

            <div className="flex gap-2 flex-wrap pt-1">
              <a
                href={`/print/dispatch-order/${doData.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#e4e4e7', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Print DO
              </a>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !allSealed}
                title={!allSealed ? 'Seal all boxes before submitting' : undefined}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
                style={{ background: allSealed ? '#22c55e' : undefined, color: '#fff',
                  ...(allSealed ? {} : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#71717a' }) }}
              >
                {submitting ? 'Submitting…' : 'Submit to Accounts'}
              </button>
            </div>

            {submitError && <p className="text-xs text-rose-400">{submitError}</p>}
            {!allSealed && (
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
                totalBoxes={totalBoxes}
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
              Submitted — awaiting accounts approval
            </div>
            <div className="text-xs text-zinc-400">
              {doData.boxes.reduce((s, b) => s + b.items.length, 0)} unit{doData.boxes.reduce((s, b) => s + b.items.length, 0) !== 1 ? 's' : ''} across {totalBoxes} box{totalBoxes !== 1 ? 'es' : ''}
            </div>
          </div>
          <ReadOnlyBoxList boxes={doData.boxes} totalBoxes={totalBoxes} />
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
                Invoice{doData.invoices.length > 1 ? 's' : ''} generated: {doData.invoices.map((inv) => inv.invoiceNumber).join(', ')}
              </div>
            )}
          </div>
          <ReadOnlyBoxList boxes={doData.boxes} totalBoxes={totalBoxes} />
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
          <ReadOnlyBoxList boxes={doData.boxes} totalBoxes={totalBoxes} />
        </div>
      )}
    </div>
  );
}

// ─── ReadOnlyBoxList ──────────────────────────────────────────────────────────
function ReadOnlyBoxList({ boxes, totalBoxes }: { boxes: PackingBoxRow[]; totalBoxes: number }) {
  return (
    <div className="flex flex-col gap-4">
      {boxes.map((box) => (
        <div key={box.id} className="card p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <span className="text-sm font-semibold text-white">Box {box.boxNumber} of {totalBoxes}</span>
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
        </div>
      ))}
    </div>
  );
}
