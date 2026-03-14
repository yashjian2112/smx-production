'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
  status:         string;
  isPartial:      boolean;
  partialReason:  string | null;
  boxPhotoUrl:    string | null;
  submittedAt:    string | null;
  items:          DispatchItem[];
  order: {
    orderNumber:  string;
    quantity:     number;
    client: {
      customerName:    string;
      shippingAddress: string | null;
      billingAddress:  string | null;
      gstNumber:       string | null;
      globalOrIndian:  string | null;
      state:           string | null;
    } | null;
    product: { code: string; name: string };
  };
  dispatchedBy: { name: string };
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function DispatchCard({ dispatch, onDone }: { dispatch: Dispatch; onDone: () => void }) {
  const [expanded, setExpanded]           = useState(true);
  const [rejectMode, setRejectMode]       = useState(false);
  const [rejectReason, setRejectReason]   = useState('');
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const router = useRouter();

  const o = dispatch.order;

  async function act(action: 'approve' | 'reject') {
    if (action === 'reject' && !rejectReason.trim()) {
      setError('Enter a rejection reason.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/shipping/dispatch/${dispatch.id}/approve`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, rejectedReason: rejectReason }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      router.refresh();
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(14,165,233,0.25)', background: 'rgba(14,165,233,0.04)' }}
    >
      {/* Header — always visible */}
      <div
        className="flex items-start justify-between gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-bold text-white">{dispatch.dispatchNumber}</span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
            >
              Awaiting Approval
            </span>
            {dispatch.isPartial && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}
              >
                Partial
              </span>
            )}
          </div>
          <div className="text-sm text-zinc-300">
            {o.client?.customerName ?? '—'} · Order #{o.orderNumber}
          </div>
          <div className="text-xs text-zinc-500">
            {o.product.name} · {dispatch.items.length} of {o.quantity} units ·
            Submitted {fmt(dispatch.submittedAt)} by {dispatch.dispatchedBy.name}
          </div>
        </div>
        <span className="text-zinc-500 text-sm mt-1">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: 'rgba(14,165,233,0.12)' }}>

          {/* Customer details */}
          {o.client && (
            <div
              className="rounded-lg p-3 mt-3 space-y-1 text-xs"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="font-semibold text-zinc-200 text-sm">{o.client.customerName}</div>
              {o.client.shippingAddress && (
                <div className="text-zinc-400">📍 Ship to: {o.client.shippingAddress}</div>
              )}
              {o.client.billingAddress && (
                <div className="text-zinc-500">🏢 Bill to: {o.client.billingAddress}</div>
              )}
              {o.client.gstNumber && (
                <div className="text-zinc-500">GST: {o.client.gstNumber}</div>
              )}
              {o.client.globalOrIndian && (
                <div className="text-zinc-500">Type: {o.client.globalOrIndian}</div>
              )}
            </div>
          )}

          {/* Partial reason */}
          {dispatch.isPartial && dispatch.partialReason && (
            <div
              className="rounded-lg p-3 text-xs"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}
            >
              ⚠️ Partial Dispatch — {dispatch.partialReason}
            </div>
          )}

          {/* Serial numbers */}
          <div>
            <div className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">
              Controllers Being Dispatched ({dispatch.items.length})
            </div>
            <div className="space-y-1.5">
              {dispatch.items.map((item, i) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 gap-3"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8' }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <div className="text-sm font-mono text-white">{item.serial}</div>
                      <div className="text-[10px] text-zinc-500">{item.barcode}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    {item.controllerPhotoUrl
                      ? <a href={`/api/blob-image?url=${encodeURIComponent(item.controllerPhotoUrl)}`} target="_blank" className="text-sky-400 hover:underline">📷 photo</a>
                      : <span>no photo</span>
                    }
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Box photo */}
          {dispatch.boxPhotoUrl && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Packed Box Photo</div>
              <a
                href={`/api/blob-image?url=${encodeURIComponent(dispatch.boxPhotoUrl)}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:underline px-3 py-2 rounded-lg"
                style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)' }}
              >
                📦 View Box Photo
              </a>
            </div>
          )}

          {/* Approve / Reject */}
          {error && (
            <div className="text-xs text-rose-400 rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.08)' }}>
              {error}
            </div>
          )}

          {rejectMode ? (
            <div className="space-y-2">
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Reason for rejection…"
                className="input-field text-sm w-full"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => act('reject')}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
                >
                  {loading ? '…' : 'Confirm Reject'}
                </button>
                <button
                  type="button"
                  onClick={() => { setRejectMode(false); setRejectReason(''); setError(''); }}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg text-sm text-zinc-400"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => act('approve')}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: '#22c55e', color: '#fff' }}
              >
                {loading ? '…' : '✓ Approve Dispatch'}
              </button>
              <button
                type="button"
                onClick={() => setRejectMode(true)}
                disabled={loading}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function DispatchApprovals({ dispatches: initial }: { dispatches: Dispatch[] }) {
  const [dispatches, setDispatches] = useState(initial);

  if (dispatches.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-white">Dispatch Approvals</div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8' }}
        >
          {dispatches.length}
        </span>
      </div>
      {dispatches.map((d) => (
        <DispatchCard
          key={d.id}
          dispatch={d}
          onDone={() => setDispatches((prev) => prev.filter((x) => x.id !== d.id))}
        />
      ))}
    </div>
  );
}
