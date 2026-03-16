'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

// ─── Types ────────────────────────────────────────────────────────────────────
type DOStatus = 'OPEN' | 'PACKING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

type ReadyOrder = {
  id: string;
  orderNumber: string;
  quantity: number;
  readyCount: number;
  client: { customerName: string } | null;
  product: { code: string; name: string };
};

type DispatchOrder = {
  id: string;
  doNumber: string;
  status: DOStatus;
  totalBoxes: number | null;
  createdAt: string;
  approvedAt: string | null;
  order: {
    orderNumber: string;
    quantity: number;
    client: { customerName: string } | null;
    product: { code: string; name: string };
  };
  createdBy: { name: string };
  approvedBy: { name: string } | null;
  boxes: { _count: { items: number } }[];
};

type Tab = 'ready' | 'packing' | 'shipped';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── DOStatusBadge ────────────────────────────────────────────────────────────
function DOStatusBadge({ status }: { status: DOStatus }) {
  const cfg: Record<DOStatus, { label: string; color: string; bg: string }> = {
    OPEN:      { label: 'Open',      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
    PACKING:   { label: 'Packing',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
    SUBMITTED: { label: 'Submitted', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function MyDispatchPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('ready');

  // Data
  const [readyOrders,  setReadyOrders]  = useState<ReadyOrder[] | null>(null);
  const [packingDOs,   setPackingDOs]   = useState<DispatchOrder[] | null>(null);
  const [shippedDOs,   setShippedDOs]   = useState<DispatchOrder[] | null>(null);

  // Loading/error per tab
  const [loadingReady,   setLoadingReady]   = useState(false);
  const [loadingPacking, setLoadingPacking] = useState(false);
  const [loadingShipped, setLoadingShipped] = useState(false);
  const [errorReady,     setErrorReady]     = useState('');
  const [errorPacking,   setErrorPacking]   = useState('');
  const [errorShipped,   setErrorShipped]   = useState('');

  // Create DO state
  const [creating,     setCreating]     = useState<string | null>(null);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});

  // Load ready orders
  async function loadReady() {
    setLoadingReady(true);
    setErrorReady('');
    try {
      const res = await fetch('/api/shipping/ready-summary');
      if (!res.ok) throw new Error('Failed to load ready orders');
      const data: ReadyOrder[] = await res.json();
      setReadyOrders(data);
    } catch (e) {
      setErrorReady(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoadingReady(false);
    }
  }

  // Load packing DOs (OPEN or PACKING)
  async function loadPacking() {
    setLoadingPacking(true);
    setErrorPacking('');
    try {
      const res = await fetch('/api/dispatch-orders/employee');
      if (!res.ok) throw new Error('Failed to load dispatch orders');
      const data: DispatchOrder[] = await res.json();
      setPackingDOs(data.filter((d) => d.status === 'OPEN' || d.status === 'PACKING'));
    } catch (e) {
      setErrorPacking(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoadingPacking(false);
    }
  }

  // Load shipped DOs (APPROVED)
  async function loadShipped() {
    setLoadingShipped(true);
    setErrorShipped('');
    try {
      const res = await fetch('/api/dispatch-orders/employee');
      if (!res.ok) throw new Error('Failed to load dispatch orders');
      const data: DispatchOrder[] = await res.json();
      setShippedDOs(data.filter((d) => d.status === 'APPROVED'));
    } catch (e) {
      setErrorShipped(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoadingShipped(false);
    }
  }

  // Tab change handler — lazy load
  function handleTabChange(t: Tab) {
    setTab(t);
    if (t === 'ready'   && readyOrders  === null) loadReady();
    if (t === 'packing' && packingDOs   === null) loadPacking();
    if (t === 'shipped' && shippedDOs   === null) loadShipped();
  }

  // Load ready tab on mount
  useEffect(() => {
    loadReady();
  }, []);

  // Create Dispatch Order and navigate to packing page
  async function createDO(orderId: string) {
    setCreating(orderId);
    setCreateErrors((prev) => ({ ...prev, [orderId]: '' }));
    try {
      const res = await fetch('/api/dispatch-orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId }),
      });
      const data = await res.json() as { id?: string; doNumber?: string; error?: string };
      if (!res.ok || !data.id) {
        setCreateErrors((prev) => ({ ...prev, [orderId]: data.error ?? 'Failed to create dispatch order' }));
        return;
      }
      router.push(`/shipping/do/${data.id}`);
    } catch {
      setCreateErrors((prev) => ({ ...prev, [orderId]: 'Network error' }));
    } finally {
      setCreating(null);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'ready',   label: 'Ready' },
    { key: 'packing', label: 'Packing' },
    { key: 'shipped', label: 'Shipped' },
  ];

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white">Dispatch</h2>
        <p className="text-sm text-zinc-400 mt-0.5">Pack and ship completed orders</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTabChange(t.key)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === t.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── READY TAB ── */}
      {tab === 'ready' && (
        <div className="space-y-3">
          {loadingReady && <div className="text-zinc-500 text-sm">Loading…</div>}

          {errorReady && (
            <div className="rounded-xl p-4 text-sm text-rose-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {errorReady}
            </div>
          )}

          {!loadingReady && readyOrders !== null && readyOrders.length === 0 && (
            <div className="text-sm text-zinc-500 text-center py-6">No orders are ready for dispatch.</div>
          )}

          {!loadingReady && (readyOrders ?? []).map((o) => (
            <div key={o.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">
                    #{o.orderNumber}
                    {o.client && <span className="text-zinc-400 font-normal"> · {o.client.customerName}</span>}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">{o.product.name}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-bold text-sky-400">{o.readyCount} ready</div>
                  <div className="text-zinc-600">of {o.quantity} ordered</div>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (o.readyCount / o.quantity) * 100)}%`,
                    background: o.readyCount >= o.quantity ? '#22c55e' : '#0ea5e9',
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => createDO(o.id)}
                disabled={creating === o.id || o.readyCount === 0}
                className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
                style={{ background: '#0ea5e9', color: '#fff' }}
              >
                {creating === o.id ? 'Creating…' : `Create Dispatch Order (${o.readyCount} unit${o.readyCount !== 1 ? 's' : ''})`}
              </button>
              {createErrors[o.id] && (
                <p className="text-xs text-rose-400">{createErrors[o.id]}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── PACKING TAB ── */}
      {tab === 'packing' && (
        <div className="space-y-3">
          {loadingPacking && <div className="text-zinc-500 text-sm">Loading…</div>}

          {errorPacking && (
            <div className="rounded-xl p-4 text-sm text-rose-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {errorPacking}
            </div>
          )}

          {!loadingPacking && packingDOs !== null && packingDOs.length === 0 && (
            <div className="text-sm text-zinc-500 text-center py-6">No active dispatch orders.</div>
          )}

          {!loadingPacking && (packingDOs ?? []).map((d) => {
            const unitCount  = d.boxes.reduce((sum, b) => sum + (b._count?.items ?? 0), 0);
            const totalBoxes = d.totalBoxes ?? d.boxes.length;
            return (
              <div key={d.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm text-white">{d.doNumber}</span>
                      <DOStatusBadge status={d.status} />
                    </div>
                    <div className="text-sm text-zinc-400 mt-0.5">
                      {d.order.client?.customerName ?? '—'} · #{d.order.orderNumber}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {d.order.product.name} · {totalBoxes > 0 ? `${totalBoxes} box${totalBoxes !== 1 ? 'es' : ''}` : 'boxes not set'} · {unitCount} unit{unitCount !== 1 ? 's' : ''} scanned
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/shipping/do/${d.id}`)}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold"
                  style={{ background: '#0ea5e9', color: '#fff' }}
                >
                  Continue Packing →
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SHIPPED TAB ── */}
      {tab === 'shipped' && (
        <div className="space-y-3">
          {loadingShipped && <div className="text-zinc-500 text-sm">Loading…</div>}

          {errorShipped && (
            <div className="rounded-xl p-4 text-sm text-rose-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {errorShipped}
            </div>
          )}

          {!loadingShipped && shippedDOs !== null && shippedDOs.length === 0 && (
            <div className="text-sm text-zinc-500 text-center py-6">No dispatched orders yet.</div>
          )}

          {!loadingShipped && (shippedDOs ?? []).map((d) => {
            const unitCount  = d.boxes.reduce((sum, b) => sum + (b._count?.items ?? 0), 0);
            const totalBoxes = d.totalBoxes ?? d.boxes.length;
            return (
              <div key={d.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm text-white">{d.doNumber}</span>
                      <DOStatusBadge status={d.status} />
                    </div>
                    <div className="text-sm text-zinc-400 mt-0.5">
                      {d.order.client?.customerName ?? '—'} · #{d.order.orderNumber}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {d.order.product.name} · {totalBoxes} box{totalBoxes !== 1 ? 'es' : ''} · {unitCount} unit{unitCount !== 1 ? 's' : ''}
                    </div>
                    {d.approvedAt && d.approvedBy && (
                      <div className="text-xs text-green-400 mt-1">
                        Dispatched {fmt(d.approvedAt)} · Approved by {d.approvedBy.name}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
