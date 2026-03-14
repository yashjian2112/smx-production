'use client';

import { useRef, useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────
type DispatchStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

type DispatchItem = {
  id:                 string;
  serial:             string;
  barcode:            string;
  controllerPhotoUrl: string | null;
  scannedAt:          string;
  unit:               { serialNumber: string; finalAssemblyBarcode: string | null };
  scannedBy:          { name: string };
};

type Dispatch = {
  id:             string;
  dispatchNumber: string;
  status:         DispatchStatus;
  isPartial:      boolean;
  partialReason:  string | null;
  boxPhotoUrl:    string | null;
  createdAt:      string;
  submittedAt:    string | null;
  items:          DispatchItem[];
  order: {
    id:          string;
    orderNumber: string;
    quantity:    number;
    client:      { customerName: string; shippingAddress: string | null } | null;
    product:     { code: string; name: string };
  };
  dispatchedBy: { id: string; name: string };
};

type ReadyOrder = {
  orderId:         string;
  orderNumber:     string;
  quantity:        number;
  client:          { customerName: string } | null;
  product:         { code: string; name: string };
  readyUnits:      { id: string; serialNumber: string; finalAssemblyBarcode: string | null }[];
  dispatchedCount: number;
  activeDraft:     { id: string; dispatchNumber: string; status: string } | null;
};

type View = 'list' | 'scan';

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function uploadPhoto(file: File, type: 'controller' | 'box'): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('type', type);
  const res = await fetch('/api/shipping/upload', { method: 'POST', body: fd });
  const data = await res.json() as { url?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? 'Upload failed');
  return data.url!;
}

// ─── PhotoCapture — inline camera button ──────────────────────────────────────
function PhotoCapture({
  label, type, onCapture, previewUrl, disabled,
}: {
  label:      string;
  type:       'controller' | 'box';
  onCapture:  (url: string) => void;
  previewUrl: string | null;
  disabled:   boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr]             = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    setUploading(true);
    try {
      const url = await uploadPhoto(file, type);
      onCapture(url);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
        disabled={disabled || uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
        style={{
          background: previewUrl ? 'rgba(22,163,74,0.12)' : 'rgba(255,255,255,0.06)',
          border:     previewUrl ? '1px solid rgba(22,163,74,0.3)' : '1px solid rgba(255,255,255,0.1)',
          color:      previewUrl ? '#4ade80' : '#a1a1aa',
        }}
      >
        {uploading ? '⏳' : previewUrl ? '✓ Photo' : '📷'} {uploading ? 'Uploading…' : label}
      </button>
      {err && <span className="text-xs text-rose-400">{err}</span>}
    </div>
  );
}

// ─── ScanPanel — main dispatch scanning UI ────────────────────────────────────
function ScanPanel({
  dispatch: initialDispatch,
  onBack,
  onSubmitted,
}: {
  dispatch:    Dispatch;
  onBack:      () => void;
  onSubmitted: (d: Dispatch) => void;
}) {
  const [dispatch, setDispatch]   = useState<Dispatch>(initialDispatch);
  const [barcode, setBarcode]     = useState('');
  const [scanning, setScanning]   = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanSuccess, setScanSuccess] = useState('');
  const [pendingPhotoItemId, setPendingPhotoItemId] = useState<string | null>(null);
  const [pendingPhotoUrl, setPendingPhotoUrl]       = useState<string | null>(null);
  const [boxPhotoUrl, setBoxPhotoUrl]   = useState<string | null>(dispatch.boxPhotoUrl);
  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState('');
  const [isPartial, setIsPartial]       = useState(false);
  const [partialReason, setPartialReason] = useState('');
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  const [removing, setRemoving]   = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const order     = dispatch.order;
  const readyCount = dispatch.items.length;
  const totalReady = order.quantity; // available from order
  const isFullyScanned = readyCount >= totalReady;

  // ── Scan submit ──
  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const b = barcode.trim().toUpperCase();
    if (!b) return;
    setScanError('');
    setScanSuccess('');
    setScanning(true);
    try {
      const res = await fetch(`/api/shipping/dispatch/${dispatch.id}/scan`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ barcode: b }),
      });
      const data = await res.json() as { item?: DispatchItem; error?: string; mismatch?: boolean };
      if (!res.ok) {
        setScanError(data.error ?? 'Scan failed');
        return;
      }
      setDispatch((prev) => ({ ...prev, items: [...prev.items, data.item!] }));
      setScanSuccess(`✓ ${data.item!.serial} added`);
      setBarcode('');
      setPendingPhotoItemId(data.item!.id);
      setPendingPhotoUrl(null);
      setTimeout(() => setScanSuccess(''), 3000);
    } catch {
      setScanError('Network error');
    } finally {
      setScanning(false);
      barcodeRef.current?.focus();
    }
  }

  // ── Attach controller photo after scan ──
  async function attachControllerPhoto(url: string) {
    if (!pendingPhotoItemId) return;
    // Optimistically update local state
    setDispatch((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === pendingPhotoItemId ? { ...item, controllerPhotoUrl: url } : item
      ),
    }));
    setPendingPhotoUrl(url);
    // Persist to server (re-scan with same barcode and photo — handled by PATCH on item)
    // We send a PATCH to update the photo on the existing item
    try {
      await fetch(`/api/shipping/dispatch/${dispatch.id}/scan`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dispatchItemId: pendingPhotoItemId, controllerPhotoUrl: url }),
      });
    } catch {
      // non-critical: photo URL already in local state
    }
    setPendingPhotoItemId(null);
  }

  // ── Remove a scanned item ──
  async function removeItem(itemId: string) {
    setRemoving(itemId);
    try {
      const res = await fetch(`/api/shipping/dispatch/${dispatch.id}/scan`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dispatchItemId: itemId }),
      });
      if (res.ok) {
        setDispatch((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== itemId) }));
        if (pendingPhotoItemId === itemId) setPendingPhotoItemId(null);
      }
    } finally {
      setRemoving(null);
    }
  }

  // ── Abandon draft ──
  async function abandonDraft() {
    try {
      await fetch(`/api/shipping/dispatch/${dispatch.id}`, { method: 'DELETE' });
      onBack();
    } catch {
      // ignore
    }
  }

  // ── Submit dispatch ──
  async function handleSubmit() {
    setSubmitError('');
    setSubmitting(true);
    try {
      if (!boxPhotoUrl) {
        setSubmitError('Please take a photo of the packed box before submitting.');
        return;
      }
      const needsPartial = readyCount < order.quantity;
      if (needsPartial && !isPartial) {
        setSubmitError(`Only ${readyCount} of ${order.quantity} units scanned. Check "Partial Dispatch" and provide a reason.`);
        return;
      }
      if (needsPartial && isPartial && !partialReason.trim()) {
        setSubmitError('Provide a reason for partial dispatch.');
        return;
      }

      const res = await fetch(`/api/shipping/dispatch/${dispatch.id}/submit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ boxPhotoUrl, isPartial, partialReason }),
      });
      const data = await res.json() as { dispatch?: Dispatch; error?: string };
      if (!res.ok) { setSubmitError(data.error ?? 'Submit failed'); return; }
      onSubmitted(data.dispatch!);
    } finally {
      setSubmitting(false);
    }
  }

  const mismatchStyle = { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="text-sm text-zinc-400 hover:text-white">← Back</button>
        <div>
          <div className="text-lg font-semibold text-white">{dispatch.dispatchNumber}</div>
          <div className="text-sm text-zinc-400">
            {order.client?.customerName ?? '—'} · Order #{order.orderNumber} · {order.product.name}
          </div>
        </div>
        {dispatch.isPartial && (
          <span className="ml-auto text-xs font-bold px-2 py-1 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
            Partial
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="card p-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-400">Controllers Scanned</span>
          <span className="font-mono font-bold text-white">{readyCount} / {order.quantity}</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (readyCount / order.quantity) * 100)}%`,
              background: isFullyScanned ? '#22c55e' : '#0ea5e9',
            }}
          />
        </div>
        {order.client?.shippingAddress && (
          <div className="text-xs text-zinc-500 pt-1">
            📍 Ship to: <span className="text-zinc-300">{order.client.shippingAddress}</span>
          </div>
        )}
      </div>

      {/* Scan input */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold text-white">Scan Controller Barcode</div>
        <form onSubmit={handleScan} className="flex gap-2">
          <input
            ref={barcodeRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan or type final assembly barcode…"
            className="input-field text-sm font-mono flex-1"
            autoFocus
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
            {scanning ? '…' : 'Scan'}
          </button>
        </form>

        {scanError && (
          <div className="rounded-lg p-3 text-sm" style={mismatchStyle}>
            {scanError}
          </div>
        )}
        {scanSuccess && (
          <div className="text-sm font-semibold" style={{ color: '#4ade80' }}>{scanSuccess}</div>
        )}

        {/* Pending controller photo */}
        {pendingPhotoItemId && (
          <div
            className="rounded-lg p-3 space-y-2"
            style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)' }}
          >
            <div className="text-xs text-sky-400 font-semibold">📷 Take a photo of this controller</div>
            <PhotoCapture
              label="Controller Photo"
              type="controller"
              onCapture={attachControllerPhoto}
              previewUrl={pendingPhotoUrl}
              disabled={false}
            />
            <button
              type="button"
              onClick={() => setPendingPhotoItemId(null)}
              className="text-xs text-zinc-500 hover:text-zinc-300"
            >
              Skip photo
            </button>
          </div>
        )}
      </div>

      {/* Scanned list */}
      {dispatch.items.length > 0 && (
        <div className="card p-4 space-y-3">
          <div className="text-sm font-semibold text-white">Scanned Controllers ({dispatch.items.length})</div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {dispatch.items.map((item, i) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}
                  >{i + 1}</span>
                  <div>
                    <div className="text-sm font-mono text-white">{item.serial}</div>
                    <div className="text-[11px] text-zinc-500">{item.barcode}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.controllerPhotoUrl ? (
                    <span className="text-[11px] text-green-400">📷</span>
                  ) : (
                    <span className="text-[11px] text-zinc-600">no photo</span>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    disabled={removing === item.id}
                    className="text-xs text-zinc-500 hover:text-rose-400 px-1.5 py-0.5 rounded"
                  >
                    {removing === item.id ? '…' : '✕'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Partial dispatch */}
      {readyCount > 0 && readyCount < order.quantity && (
        <div
          className="card p-4 space-y-3"
          style={{ border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.04)' }}
        >
          <div className="flex items-center gap-2">
            <input
              id="partial-check"
              type="checkbox"
              checked={isPartial}
              onChange={(e) => setIsPartial(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="partial-check" className="text-sm text-amber-300 font-semibold cursor-pointer">
              This is a Partial Dispatch ({readyCount} of {order.quantity} units)
            </label>
          </div>
          {isPartial && (
            <input
              value={partialReason}
              onChange={(e) => setPartialReason(e.target.value)}
              placeholder="Reason for partial dispatch (e.g. remaining units in production)…"
              className="input-field text-sm w-full"
            />
          )}
        </div>
      )}

      {/* Box photo */}
      <div className="card p-4 space-y-3">
        <div className="text-sm font-semibold text-white">
          📦 Packed Box Photo <span className="text-rose-400 text-xs">*required</span>
        </div>
        <div className="text-xs text-zinc-500">Take a photo of the sealed/packed box before submitting.</div>
        <PhotoCapture
          label={boxPhotoUrl ? 'Retake Box Photo' : 'Take Box Photo'}
          type="box"
          onCapture={setBoxPhotoUrl}
          previewUrl={boxPhotoUrl}
          disabled={submitting}
        />
      </div>

      {/* Submit */}
      {dispatch.items.length > 0 && (
        <div className="space-y-3">
          {submitError && (
            <div className="rounded-lg p-3 text-sm" style={mismatchStyle}>{submitError}</div>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !boxPhotoUrl}
            className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: '#22c55e', color: '#fff' }}
          >
            {submitting ? 'Submitting…' : `Submit Dispatch (${readyCount} controller${readyCount !== 1 ? 's' : ''})`}
          </button>
          {!boxPhotoUrl && (
            <p className="text-xs text-center text-zinc-500">Take a box photo to enable submit</p>
          )}
        </div>
      )}

      {/* Abandon */}
      <div className="pt-2">
        {!abandonConfirm ? (
          <button
            type="button"
            onClick={() => setAbandonConfirm(true)}
            className="text-xs text-zinc-600 hover:text-rose-400 transition-colors"
          >
            Abandon this dispatch
          </button>
        ) : (
          <div className="flex gap-2 items-center">
            <span className="text-xs text-zinc-400">Sure?</span>
            <button type="button" onClick={abandonDraft} className="text-xs font-semibold text-rose-400">Yes, Abandon</button>
            <button type="button" onClick={() => setAbandonConfirm(false)} className="text-xs text-zinc-500">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SubmittedBadge ────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: DispatchStatus }) {
  const cfg: Record<DispatchStatus, { label: string; color: string; bg: string }> = {
    DRAFT:     { label: 'Draft',     color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
    SUBMITTED: { label: 'Submitted', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
    APPROVED:  { label: 'Approved',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
    REJECTED:  { label: 'Rejected',  color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  };
  const c = cfg[status];
  return (
    <span
      className="text-[11px] font-bold px-2 py-0.5 rounded"
      style={{ color: c.color, background: c.bg }}
    >
      {c.label}
    </span>
  );
}

// ─── Main ShippingPanel ────────────────────────────────────────────────────────
export function ShippingPanel({
  sessionRole,
  sessionName,
  initialDrafts,
}: {
  sessionRole:   string;
  sessionName:   string;
  initialDrafts: Dispatch[];
}) {
  const [view, setView]               = useState<View>('list');
  const [drafts, setDrafts]           = useState<Dispatch[]>(initialDrafts);
  const [activeDispatch, setActive]   = useState<Dispatch | null>(null);
  const [orders, setOrders]           = useState<ReadyOrder[] | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [searchQ, setSearchQ]         = useState('');
  const [creating, setCreating]       = useState<string | null>(null);
  const [submitted, setSubmitted]     = useState<Dispatch | null>(null);

  // Load ready orders on demand
  async function loadOrders() {
    setLoadingOrders(true);
    try {
      const res  = await fetch('/api/shipping/orders');
      const data = await res.json() as { orders?: ReadyOrder[] };
      setOrders(data.orders ?? []);
    } finally {
      setLoadingOrders(false);
    }
  }

  // Start or continue a dispatch
  async function startDispatch(orderId: string) {
    setCreating(orderId);
    try {
      const res  = await fetch('/api/shipping/dispatch', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId }),
      });
      const data = await res.json() as { dispatch?: Dispatch; error?: string };
      if (!res.ok || !data.dispatch) return;
      const d = data.dispatch as Dispatch;
      // Normalize dates
      const normalized: Dispatch = {
        ...d,
        createdAt:   new Date(d.createdAt).toISOString(),
        submittedAt: d.submittedAt ? new Date(d.submittedAt).toISOString() : null,
        items: (d.items ?? []).map((item: any) => ({
          ...item,
          scannedAt: new Date(item.scannedAt).toISOString(),
        })),
      };
      // Update drafts list
      setDrafts((prev) => {
        const idx = prev.findIndex((x) => x.id === normalized.id);
        return idx >= 0 ? prev.map((x, i) => (i === idx ? normalized : x)) : [normalized, ...prev];
      });
      setActive(normalized);
      setView('scan');
    } finally {
      setCreating(null);
    }
  }

  function openDraft(d: Dispatch) {
    setActive(d);
    setView('scan');
    setSubmitted(null);
  }

  function handleBack() {
    setView('list');
    setActive(null);
    setSubmitted(null);
    loadOrders(); // refresh
  }

  function handleSubmitted(d: Dispatch) {
    setSubmitted(d);
    setDrafts((prev) => prev.filter((x) => x.id !== d.id));
    setView('list');
    setActive(null);
  }

  // Filter orders
  const filteredOrders = (orders ?? []).filter((o) => {
    if (!searchQ.trim()) return true;
    const q = searchQ.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      (o.client?.customerName ?? '').toLowerCase().includes(q) ||
      o.product.name.toLowerCase().includes(q)
    );
  });

  // ── Scan view ──
  if (view === 'scan' && activeDispatch) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <ScanPanel dispatch={activeDispatch} onBack={handleBack} onSubmitted={handleSubmitted} />
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Shipping</h2>
          <p className="text-sm text-zinc-400 mt-0.5">Scan-to-pack controllers for dispatch</p>
        </div>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}
        >
          📦 {sessionName}
        </span>
      </div>

      {/* Submitted success banner */}
      {submitted && (
        <div
          className="rounded-xl p-4 space-y-1"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          <div className="text-sm font-bold text-green-400">
            ✓ Dispatch {submitted.dispatchNumber} submitted for approval
          </div>
          <div className="text-xs text-zinc-400">
            {submitted.items.length} controller{submitted.items.length !== 1 ? 's' : ''} for {submitted.order.client?.customerName ?? '—'} · sent to Accounts
          </div>
          <button type="button" onClick={() => setSubmitted(null)} className="text-xs text-zinc-500 hover:text-zinc-300">
            Dismiss
          </button>
        </div>
      )}

      {/* Active drafts */}
      {drafts.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-zinc-300">In Progress ({drafts.length})</div>
          {drafts.map((d) => (
            <div
              key={d.id}
              className="card p-4 cursor-pointer hover:ring-1 hover:ring-sky-500 transition-all"
              onClick={() => openDraft(d)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-semibold text-white">{d.dispatchNumber}</span>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="text-sm text-zinc-400 mt-0.5">
                    {d.order.client?.customerName ?? '—'} · #{d.order.orderNumber}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {d.order.product.name} · Scanned {d.items.length} of {d.order.quantity}
                  </div>
                </div>
                <span className="text-sky-400 text-sm">→</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ready orders */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-300">Ready to Dispatch</div>
          {!orders && !loadingOrders && (
            <button
              type="button"
              onClick={loadOrders}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
              style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}
            >
              Load Orders
            </button>
          )}
        </div>

        {loadingOrders && (
          <div className="text-sm text-zinc-500 text-center py-4">Loading…</div>
        )}

        {orders !== null && (
          <>
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search by order no., customer, product…"
              className="input-field text-sm w-full"
            />

            {filteredOrders.length === 0 && (
              <div className="text-sm text-zinc-500 text-center py-6">No ready orders found.</div>
            )}

            <div className="space-y-3">
              {filteredOrders.map((o) => (
                <div
                  key={o.orderId}
                  className="card p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        #{o.orderNumber}
                        {o.client && <span className="text-zinc-400 font-normal"> · {o.client.customerName}</span>}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">{o.product.name}</div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-bold text-sky-400">{o.readyUnits.length} ready</div>
                      <div className="text-zinc-600">{o.dispatchedCount} dispatched / {o.quantity} ordered</div>
                    </div>
                  </div>

                  {/* Ready serials preview */}
                  {o.readyUnits.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {o.readyUnits.slice(0, 6).map((u) => (
                        <span
                          key={u.id}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(14,165,233,0.08)', color: '#7dd3fc' }}
                        >
                          {u.serialNumber}
                        </span>
                      ))}
                      {o.readyUnits.length > 6 && (
                        <span className="text-[10px] text-zinc-500">+{o.readyUnits.length - 6} more</span>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => startDispatch(o.orderId)}
                    disabled={creating === o.orderId || o.readyUnits.length === 0}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
                    style={{ background: '#0ea5e9', color: '#fff' }}
                  >
                    {creating === o.orderId
                      ? 'Starting…'
                      : o.activeDraft
                      ? `Continue Dispatch (${o.activeDraft.dispatchNumber})`
                      : `Start Dispatch (${o.readyUnits.length} controller${o.readyUnits.length !== 1 ? 's' : ''})`}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
