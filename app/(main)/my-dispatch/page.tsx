'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

/* ── Types ── */
type DOStatus = 'OPEN' | 'PACKING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

type DispatchOrder = {
  id: string;
  doNumber: string;
  status: DOStatus;
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

type ReadyOrder = {
  id: string;
  orderNumber: string;
  quantity: number;
  readyCount: number;
  client: { customerName: string } | null;
  product: { code: string; name: string };
};

type Tab = 'ready' | 'active' | 'shipped';

/* ── Status badge ── */
const STATUS_STYLE: Record<DOStatus, string> = {
  OPEN:      'bg-amber-500/20 text-amber-400 border border-amber-500/30',
  PACKING:   'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  SUBMITTED: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
  APPROVED:  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  REJECTED:  'bg-red-500/20 text-red-400 border border-red-500/30',
};
const STATUS_LABEL: Record<DOStatus, string> = {
  OPEN:      'Open',
  PACKING:   'Packing',
  SUBMITTED: 'Pending Approval',
  APPROVED:  'Dispatched ✓',
  REJECTED:  'Rejected',
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ── Ready Order Card ── */
function ReadyCard({ order, onCreateDO, creating }: {
  order: ReadyOrder;
  onCreateDO: (id: string) => void;
  creating: string | null;
}) {
  return (
    <div className="rounded-xl border p-4 space-y-2"
      style={{ background: 'rgba(20,83,45,0.12)', borderColor: 'rgba(74,222,128,0.2)' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm text-sky-400">{order.orderNumber}</p>
          <p className="text-sm font-medium text-white mt-0.5">{order.product.name}</p>
          {order.client && (
            <p className="text-xs text-slate-400 mt-0.5">{order.client.customerName}</p>
          )}
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
          Ready for Dispatch
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span>{order.readyCount} of {order.quantity} units ready</span>
        {order.readyCount === order.quantity && (
          <span className="text-emerald-400">● All units ready</span>
        )}
      </div>
      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${Math.min(100, (order.readyCount / order.quantity) * 100)}%` }}
        />
      </div>
      {/* Create Dispatch Order button */}
      <button
        type="button"
        onClick={() => onCreateDO(order.id)}
        disabled={creating === order.id || order.readyCount === 0}
        className="w-full mt-3 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
        style={{ background: '#0ea5e9', color: '#fff' }}
      >
        {creating === order.id ? 'Creating…' : `Create Dispatch Order (${order.readyCount} unit${order.readyCount !== 1 ? 's' : ''})`}
      </button>
    </div>
  );
}

/* ── DO Card ── */
function DOCard({ do: d, showPack }: { do: DispatchOrder; showPack?: boolean }) {
  const router = useRouter();
  const totalBoxes = d.boxes.length;
  const totalUnits = d.boxes.reduce((s, b) => s + b._count.items, 0);

  return (
    <div className="rounded-xl border p-4 space-y-3"
      style={{ background: 'rgba(15,23,42,0.8)', borderColor: 'rgba(148,163,184,0.1)' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-bold text-sky-400">{d.doNumber}</p>
          <p className="text-sm font-medium text-white mt-0.5">{d.order.product.name}</p>
          {d.order.client && (
            <p className="text-xs text-slate-400 mt-0.5">{d.order.client.customerName}</p>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[d.status]}`}>
          {STATUS_LABEL[d.status]}
        </span>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg p-2" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <p className="text-xs text-slate-500">Order</p>
          <p className="text-xs font-mono text-slate-300 truncate">{d.order.orderNumber}</p>
        </div>
        <div className="rounded-lg p-2" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <p className="text-xs text-slate-500">Units Packed</p>
          <p className="text-sm font-semibold text-white">{totalUnits}</p>
        </div>
        <div className="rounded-lg p-2" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <p className="text-xs text-slate-500">Boxes</p>
          <p className="text-sm font-semibold text-white">{totalBoxes}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Created {fmt(d.createdAt)} by {d.createdBy.name}</span>
        {d.approvedAt && d.approvedBy && (
          <span className="text-emerald-400">Dispatched {fmt(d.approvedAt)}</span>
        )}
      </div>

      {/* Continue Packing button */}
      {showPack && ['OPEN', 'PACKING'].includes(d.status) && (
        <button
          type="button"
          onClick={() => router.push(`/shipping/do/${d.id}`)}
          className="w-full py-2.5 rounded-lg text-sm font-semibold mt-2"
          style={{ background: '#0ea5e9', color: '#fff' }}
        >
          Continue Packing →
        </button>
      )}
    </div>
  );
}

/* ── Main Page ── */
export default function MyDispatchPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('ready');
  const [readyOrders, setReadyOrders] = useState<ReadyOrder[]>([]);
  const [activeDOs, setActiveDOs]     = useState<DispatchOrder[]>([]);
  const [shippedDOs, setShippedDOs]   = useState<DispatchOrder[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [creating, setCreating]       = useState<string | null>(null);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        // Active DOs (OPEN, PACKING, SUBMITTED) + Shipped (APPROVED)
        const [doRes, readyRes] = await Promise.all([
          fetch('/api/dispatch-orders/employee'),
          fetch('/api/shipping/ready-summary'),
        ]);

        if (!doRes.ok) throw new Error('Failed to load dispatch orders');
        if (!readyRes.ok) throw new Error('Failed to load ready orders');

        const dos: DispatchOrder[]  = await doRes.json();
        const ready: ReadyOrder[]   = await readyRes.json();

        setActiveDOs(dos.filter((d) => ['OPEN', 'PACKING', 'SUBMITTED'].includes(d.status)));
        setShippedDOs(dos.filter((d) => d.status === 'APPROVED'));
        setReadyOrders(ready);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error loading data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function createDO(orderId: string) {
    setCreating(orderId);
    setCreateError('');
    try {
      const res  = await fetch('/api/dispatch-orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setCreateError(data.error ?? 'Failed to create dispatch order');
        return;
      }
      router.push(`/shipping/do/${data.id}`);
    } catch {
      setCreateError('Network error');
    } finally {
      setCreating(null);
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'ready',  label: 'Ready',       count: readyOrders.length },
    { key: 'active', label: 'In Dispatch',  count: activeDOs.length },
    { key: 'shipped',label: 'Shipped',      count: shippedDOs.length },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white">Dispatch Tracker</h2>
        <p className="text-sm text-slate-400 mt-0.5">Track orders from production to delivery</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(15,23,42,0.8)' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
              tab === t.key
                ? 'bg-sky-500/20 text-sky-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                tab === t.key ? 'bg-sky-500/30 text-sky-300' : 'bg-slate-700 text-slate-400'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-xl p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      ) : tab === 'ready' ? (
        readyOrders.length === 0 ? (
          <EmptyState message="No orders are ready for dispatch" sub="Units must complete Final Assembly and be approved" />
        ) : (
          <div className="space-y-3">
            {createError && (
              <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {createError}
              </div>
            )}
            {readyOrders.map((o) => (
              <ReadyCard key={o.id} order={o} onCreateDO={createDO} creating={creating} />
            ))}
          </div>
        )
      ) : tab === 'active' ? (
        activeDOs.length === 0 ? (
          <EmptyState message="No active dispatch orders" sub="Dispatch orders will appear here once shipping starts packing" />
        ) : (
          <div className="space-y-3">
            {activeDOs.map((d) => <DOCard key={d.id} do={d} showPack={true} />)}
          </div>
        )
      ) : (
        shippedDOs.length === 0 ? (
          <EmptyState message="No dispatched orders yet" sub="Approved dispatch orders will appear here" />
        ) : (
          <div className="space-y-3">
            {shippedDOs.map((d) => <DOCard key={d.id} do={d} />)}
          </div>
        )
      )}
    </div>
  );
}

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
        style={{ background: 'rgba(148,163,184,0.08)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      </div>
      <p className="text-slate-400 font-medium">{message}</p>
      <p className="text-xs text-slate-600">{sub}</p>
    </div>
  );
}
