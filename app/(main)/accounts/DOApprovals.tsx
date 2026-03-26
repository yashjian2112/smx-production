'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, MapPin, Building2 } from 'lucide-react';

type PackingBoxItemRow = {
  id: string;
  serial: string;
  barcode: string;
  scannedAt: string;
  unit: { serialNumber: string; finalAssemblyBarcode: string | null };
};

type PackingBoxRow = {
  id: string;
  boxNumber: number;
  boxLabel: string;
  photoUrl: string | null;
  isSealed: boolean;
  createdAt: string;
  items: PackingBoxItemRow[];
};

type DORow = {
  id: string;
  doNumber: string;
  status: string;
  totalBoxes: number | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    orderNumber: string;
    quantity: number;
    client: {
      customerName: string;
      shippingAddress: string | null;
      billingAddress: string | null;
      gstNumber: string | null;
      globalOrIndian: string | null;
      state: string | null;
    } | null;
    product: { code: string; name: string };
  };
  createdBy: { name: string };
  boxes: PackingBoxRow[];
};

function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DOCard({ dispatch, onDone }: { dispatch: DORow; onDone: () => void }) {
  const [expanded, setExpanded]         = useState(true);
  const [rejectMode, setRejectMode]     = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const [successMsg, setSuccessMsg]     = useState('');
  const router = useRouter();

  const o = dispatch.order;

  // All units across all boxes
  const allItems = dispatch.boxes.flatMap((b) => b.items);

  async function act(action: 'approve' | 'reject') {
    if (action === 'reject' && !rejectReason.trim()) {
      setError('Enter a rejection reason.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/dispatch-orders/${dispatch.id}/approve`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, rejectedReason: rejectReason }),
      });
      const data = await res.json() as { error?: string; generatedInvoiceNumbers?: string[] };
      if (!res.ok) {
        setError(data.error ?? 'Failed');
        return;
      }
      if (action === 'approve' && data.generatedInvoiceNumbers?.length) {
        setSuccessMsg(`Approved. Invoice${data.generatedInvoiceNumbers.length > 1 ? 's' : ''} generated: ${data.generatedInvoiceNumbers.join(', ')}`);
        // Give a moment for the user to read the success message, then remove card
        setTimeout(() => {
          router.refresh();
          onDone();
        }, 2500);
      } else {
        router.refresh();
        onDone();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.04)' }}
    >
      {/* Header — always visible */}
      <div
        className="flex items-start justify-between gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono font-bold text-white">{dispatch.doNumber}</span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}
            >
              Awaiting Approval
            </span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd' }}
            >
              Dispatch Order
            </span>
          </div>
          <div className="text-sm text-zinc-300">
            {o.client?.customerName ?? '—'} · Order #{o.orderNumber}
          </div>
          <div className="text-xs text-zinc-500">
            {o.product.name} · {allItems.length} units · {dispatch.boxes.length} box{dispatch.boxes.length !== 1 ? 'es' : ''} ·
            Submitted {fmt(dispatch.submittedAt)} by {dispatch.createdBy.name}
          </div>
        </div>
        <span className="text-zinc-500 text-sm mt-1">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t" style={{ borderColor: 'rgba(139,92,246,0.12)' }}>

          {/* Client details */}
          {o.client && (
            <div
              className="rounded-lg p-3 mt-3 space-y-1 text-xs"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div className="font-semibold text-zinc-200 text-sm">{o.client.customerName}</div>
              {o.client.shippingAddress && (
                <div className="text-zinc-400 flex items-center"><MapPin className="w-4 h-4 mr-1 inline" /> Ship to: {o.client.shippingAddress}</div>
              )}
              {o.client.billingAddress && (
                <div className="text-zinc-500 flex items-center"><Building2 className="w-4 h-4 mr-1 inline" /> Bill to: {o.client.billingAddress}</div>
              )}
              {o.client.gstNumber && (
                <div className="text-zinc-500">GST: {o.client.gstNumber}</div>
              )}
              {o.client.globalOrIndian && (
                <div className="text-zinc-500">
                  Type:{' '}
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold"
                    style={
                      o.client.globalOrIndian === 'Global'
                        ? { background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }
                        : { background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }
                    }
                  >
                    {o.client.globalOrIndian}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Box list */}
          <div>
            <div className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">
              Boxes ({dispatch.boxes.length})
            </div>
            <div className="space-y-2">
              {dispatch.boxes.map((box) => (
                <div
                  key={box.id}
                  className="rounded-lg p-3"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-white">{box.boxLabel}</span>
                      {box.isSealed && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}
                        >
                          Sealed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">{box.items.length} unit{box.items.length !== 1 ? 's' : ''}</span>
                      {box.photoUrl && (
                        <a
                          href={`/api/blob-image?url=${encodeURIComponent(box.photoUrl)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-xs text-sky-400 hover:underline px-2 py-1 rounded"
                          style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.15)' }}
                        >
                          <Camera className="w-4 h-4 mr-1 inline" /> Photo
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* All unit serials */}
          <div>
            <div className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wide">
              Units Being Dispatched ({allItems.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allItems.map((item, i) => (
                <span
                  key={item.id}
                  className="text-xs font-mono px-2 py-1 rounded"
                  style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', color: '#c4b5fd' }}
                  title={item.barcode}
                >
                  {item.serial}
                </span>
              ))}
            </div>
          </div>

          {/* Success message */}
          {successMsg && (
            <div
              className="rounded-lg px-3 py-2 text-sm text-green-300"
              style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              <Check className="w-4 h-4 mr-1 inline" /> {successMsg}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-rose-400 rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.08)' }}>
              {error}
            </div>
          )}

          {/* Approve / Reject */}
          {!successMsg && (
            rejectMode ? (
              <div className="space-y-2">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection…"
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 resize-none"
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
                  {loading ? '…' : <><Check className="w-4 h-4 mr-1" /> Approve & Generate Invoice</>}
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
            )
          )}
        </div>
      )}
    </div>
  );
}

export function DOApprovals({ dispatches: initial }: { dispatches: DORow[] }) {
  const [dispatches, setDispatches] = useState(initial);

  if (dispatches.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-white">Dispatch Order Approvals</div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}
        >
          {dispatches.length}
        </span>
      </div>
      {dispatches.map((d) => (
        <DOCard
          key={d.id}
          dispatch={d}
          onDone={() => setDispatches((prev) => prev.filter((x) => x.id !== d.id))}
        />
      ))}
    </div>
  );
}
