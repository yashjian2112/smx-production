'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Package, MapPin, Clock, Check, X, AlertTriangle, Truck, Upload, Camera,
} from 'lucide-react';

type TimelineEntry = {
  id: string; status: string; action: string; notes: string | null;
  createdAt: string; user: { id: string; name: string };
};
type PackingBox = {
  id: string; boxNumber: number; label: string; items: string | null;
  isSealed: boolean; photoUrl: string | null;
};
type IGData = {
  id: string; igNumber: string; status: string; description: string;
  items: string; purpose: string | null; notes: string | null;
  expectedArrival: string | null; expectedReturn: string | null;
  ganDate: string | null; ganNotes: string | null; courierDetails: string | null;
  grnDate: string | null; grnNotes: string | null; warehouseLocation: string | null;
  returnInitiatedAt: string | null; dnNumber: string | null; boxCount: number | null;
  dispatchedAt: string | null; dispatchCourier: string | null; trackingNumber: string | null;
  closedAt: string | null; rejectedAt: string | null; rejectionReason: string | null;
  createdAt: string;
  client: { id: string; code: string; customerName: string };
  createdBy: { id: string; name: string };
  ganBy: { id: string; name: string } | null;
  grnBy: { id: string; name: string } | null;
  timeline: TimelineEntry[];
  boxes: PackingBox[];
};

const STATUS_COLOR: Record<string, string> = {
  REQUESTED: '#fbbf24', GAN_CREATED: '#38bdf8', RECEIVED: '#4ade80',
  IN_USE: '#f59e0b', IN_STORE: '#a78bfa', RETURN_INITIATED: '#ec4899',
  PACKING: '#06b6d4', PACKED: '#10b981', DISPATCHED: '#3b82f6',
  CLOSED: '#a1a1aa', REJECTED: '#f87171',
};
const STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested', GAN_CREATED: 'GAN Created', RECEIVED: 'Received (GRN)',
  IN_USE: 'In Use', IN_STORE: 'In Store', RETURN_INITIATED: 'Return Initiated',
  PACKING: 'Packing', PACKED: 'Packed', DISPATCHED: 'Dispatched',
  CLOSED: 'Closed', REJECTED: 'Rejected',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function IGDetail({ igId, role, userId }: { igId: string; role: string; userId: string }) {
  const router = useRouter();
  const [ig, setIg] = useState<IGData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadingBox, setUploadingBox] = useState<string | null>(null);

  const fetchIG = useCallback(async () => {
    const res = await fetch(`/api/implementation-goods/${igId}`);
    if (res.ok) setIg(await res.json());
    setLoading(false);
  }, [igId]);

  useEffect(() => { fetchIG(); }, [fetchIG]);

  async function doAction(action: string, extra?: Record<string, unknown>) {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/implementation-goods/${igId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Action failed');
        return;
      }
      await fetchIG();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBoxPhoto(boxId: string, file: File) {
    setUploadingBox(boxId);
    try {
      // Upload to blob
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/blob-image', { method: 'POST', body: formData });
      if (!uploadRes.ok) { setError('Photo upload failed'); return; }
      const { url } = await uploadRes.json();

      // Seal box
      const res = await fetch(`/api/implementation-goods/${igId}/boxes`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId, photoUrl: url }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to seal box');
        return;
      }
      await fetchIG();
    } finally {
      setUploadingBox(null);
    }
  }

  async function submitPacking() {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/implementation-goods/${igId}/submit`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Submit failed');
        return;
      }
      await fetchIG();
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-zinc-500">Loading...</div>;
  if (!ig) return <div className="p-8 text-center text-red-400">IG not found</div>;

  const color = STATUS_COLOR[ig.status] ?? '#a1a1aa';
  let parsedItems: Array<{ name: string; qty: number; unit: string; condition: string }> = [];
  try { parsedItems = JSON.parse(ig.items); } catch { /* */ }

  const canPack = ['PACKING', 'PRODUCTION_EMPLOYEE', 'ADMIN'].includes(role);
  const allSealed = ig.boxes.length > 0 && ig.boxes.every(b => b.isSealed);

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/sales?tab=impl" className="text-zinc-400 hover:text-white"><ArrowLeft className="w-5 h-5" /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-lg text-white">{ig.igNumber}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: `${color}1a`, color }}>
              {STATUS_LABEL[ig.status] ?? ig.status}
            </span>
          </div>
          <p className="text-zinc-400 text-sm">{ig.client.customerName}</p>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
          {error}
        </div>
      )}

      {/* Description & Items */}
      <div className="card p-4 space-y-3">
        <p className="text-sm text-zinc-300">{ig.description}</p>
        {ig.purpose && <p className="text-xs text-zinc-500">Purpose: {ig.purpose}</p>}
        {parsedItems.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">Items</p>
            {parsedItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs py-0.5">
                <span className="text-zinc-600 font-mono w-5">{idx + 1}.</span>
                <span className="text-zinc-300 flex-1">{item.name}</span>
                <span className="text-zinc-500">{item.qty} {item.unit}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#71717a' }}>{item.condition}</span>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
          {ig.expectedArrival && <div><Clock className="w-3 h-3 inline mr-1" />Arrival: {fmtDate(ig.expectedArrival)}</div>}
          {ig.expectedReturn && <div><Clock className="w-3 h-3 inline mr-1" />Return by: {fmtDate(ig.expectedReturn)}</div>}
          {ig.warehouseLocation && <div><MapPin className="w-3 h-3 inline mr-1" />Location: {ig.warehouseLocation}</div>}
          {ig.trackingNumber && <div><Truck className="w-3 h-3 inline mr-1" />Tracking: {ig.trackingNumber}</div>}
          {ig.dnNumber && <div><Package className="w-3 h-3 inline mr-1" />DN: {ig.dnNumber}</div>}
        </div>
      </div>

      {/* Timeline */}
      <div className="card p-4">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-3">Timeline</p>
        <div className="space-y-0">
          {ig.timeline.map((t, idx) => {
            const tColor = STATUS_COLOR[t.status] ?? '#a1a1aa';
            const isLast = idx === ig.timeline.length - 1;
            return (
              <div key={t.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-1" style={{ background: tColor }} />
                  {!isLast && <div className="w-px flex-1 my-0.5" style={{ background: 'rgba(255,255,255,0.08)' }} />}
                </div>
                <div className="pb-3 min-w-0">
                  <p className="text-xs text-zinc-300 font-medium">{t.action}</p>
                  <p className="text-[10px] text-zinc-600">{t.user.name} · {fmtDateTime(t.createdAt)}</p>
                  {t.notes && <p className="text-[10px] text-zinc-500 mt-0.5">{t.notes}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Packing Section — shown when PACKING status */}
      {ig.status === 'PACKING' && canPack && ig.boxes.length > 0 && (
        <div className="card p-4 space-y-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Packing Boxes</p>
          {ig.boxes.map((box) => (
            <div key={box.id} className="rounded-lg p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs text-zinc-300">{box.label}</span>
                {box.isSealed ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1" style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80' }}>
                    <Check className="w-3 h-3" /> Sealed
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24' }}>
                    Open
                  </span>
                )}
              </div>
              {box.isSealed && box.photoUrl && (
                <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Camera className="w-3 h-3" /> Photo uploaded
                </div>
              )}
              {!box.isSealed && (
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <div
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.25)' }}
                  >
                    {uploadingBox === box.id ? '...' : <><Upload className="w-3.5 h-3.5" /> Upload Photo &amp; Seal</>}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={!!uploadingBox}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleBoxPhoto(box.id, f);
                    }}
                  />
                </label>
              )}
            </div>
          ))}

          {allSealed && (
            <button
              type="button"
              disabled={actionLoading}
              onClick={submitPacking}
              className="w-full py-2.5 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}
            >
              {actionLoading ? '...' : 'Submit Packing List'}
            </button>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2">
        {['PURCHASE_MANAGER', 'ADMIN'].includes(role) && ig.status === 'REQUESTED' && (
          <div className="flex gap-2">
            <button disabled={actionLoading} onClick={() => doAction('gan')}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50"
              style={{ background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)', color: '#38bdf8' }}>
              {actionLoading ? '...' : 'Log GAN (Goods Arrived)'}
            </button>
            <button disabled={actionLoading} onClick={() => doAction('reject')}
              className="py-2.5 px-4 text-sm font-semibold rounded-xl disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {['INVENTORY_MANAGER', 'ADMIN'].includes(role) && ig.status === 'GAN_CREATED' && (
          <button disabled={actionLoading} onClick={() => doAction('grn')}
            className="w-full py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
            {actionLoading ? '...' : 'Complete GRN'}
          </button>
        )}

        {['INVENTORY_MANAGER', 'ADMIN'].includes(role) && ['RECEIVED', 'IN_STORE'].includes(ig.status) && (
          <button disabled={actionLoading} onClick={() => doAction('issue')}
            className="w-full py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50"
            style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}>
            {actionLoading ? '...' : 'Issue for Use'}
          </button>
        )}

        {['INVENTORY_MANAGER', 'ADMIN'].includes(role) && ig.status === 'IN_USE' && (
          <button disabled={actionLoading} onClick={() => doAction('return_to_store')}
            className="w-full py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50"
            style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>
            {actionLoading ? '...' : 'Return to Store'}
          </button>
        )}

        {['SALES', 'ADMIN'].includes(role) && ['IN_STORE', 'RECEIVED'].includes(ig.status) && (
          <button disabled={actionLoading} onClick={() => doAction('return_initiate')}
            className="w-full py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50"
            style={{ background: 'rgba(236,72,153,0.15)', border: '1px solid rgba(236,72,153,0.3)', color: '#ec4899' }}>
            {actionLoading ? '...' : 'Initiate Return to Customer'}
          </button>
        )}

        {canPack && ig.status === 'RETURN_INITIATED' && (
          <button disabled={actionLoading} onClick={() => doAction('start_packing', { boxCount: 1 })}
            className="w-full py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50"
            style={{ background: 'rgba(6,182,212,0.15)', border: '1px solid rgba(6,182,212,0.3)', color: '#06b6d4' }}>
            {actionLoading ? '...' : 'Start Packing (1 Box)'}
          </button>
        )}

        {['ACCOUNTS', 'ADMIN'].includes(role) && ig.status === 'PACKED' && (
          <button disabled={actionLoading} onClick={() => doAction('dispatch')}
            className="w-full py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50"
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6' }}>
            {actionLoading ? '...' : 'Approve & Dispatch'}
          </button>
        )}

        {['SALES', 'ADMIN'].includes(role) && ig.status === 'DISPATCHED' && (
          <button disabled={actionLoading} onClick={() => doAction('close')}
            className="w-full py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50"
            style={{ background: 'rgba(113,113,122,0.15)', border: '1px solid rgba(113,113,122,0.3)', color: '#a1a1aa' }}>
            {actionLoading ? '...' : 'Confirm Customer Received'}
          </button>
        )}
      </div>
    </div>
  );
}
