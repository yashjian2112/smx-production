'use client';

import { useEffect, useState } from 'react';

export const dynamic = 'force-dynamic';

/* ── Types ── */
type DOStatus = 'OPEN' | 'PACKING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

type DispatchOrder = {
  id: string;
  doNumber: string;
  orderId: string;
  dispatchQty: number;
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
  units: { id: string; serialNumber: string }[];
};

type OrderGroup = {
  orderId: string;
  orderNumber: string;
  quantity: number;
  client: { customerName: string } | null;
  product: { code: string; name: string };
  dos: DispatchOrder[];
};

type Tab = 'topack' | 'processing' | 'completed';

/* ── Helpers ── */
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

function groupByOrder(dos: DispatchOrder[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();
  for (const d of dos) {
    const key = d.orderId;
    if (!map.has(key)) {
      map.set(key, {
        orderId:     d.orderId,
        orderNumber: d.order.orderNumber,
        quantity:    d.order.quantity,
        client:      d.order.client,
        product:     d.order.product,
        dos:         [],
      });
    }
    map.get(key)!.dos.push(d);
  }
  return Array.from(map.values());
}

/* ── Ready Order Card ── */
function ReadyCard({ order, onCreateDO, creating }: {
  order: ReadyOrder;
  onCreateDO: (id: string, qty: number) => void;
  creating: string | null;
}) {
  const [expanded,    setExpanded]    = useState(false);
  const [showQtyForm, setShowQtyForm] = useState(false);
  const [qtyInput,    setQtyInput]    = useState(String(order.readyCount));
  const [qtyError,    setQtyError]    = useState('');

  function handleConfirmCreate() {
    const qty = parseInt(qtyInput, 10);
    if (isNaN(qty) || qty < 1) { setQtyError('Enter a valid quantity'); return; }
    if (qty > order.readyCount) { setQtyError(`Max ${order.readyCount} units ready`); return; }
    setQtyError('');
    onCreateDO(order.id, qty);
    setShowQtyForm(false);
  }

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
        {order.units.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="text-sky-400 hover:text-sky-300 transition-colors ml-auto"
          >
            {expanded ? '▲ Hide units' : `▼ Show ${order.units.length} units`}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${Math.min(100, (order.readyCount / order.quantity) * 100)}%` }}
        />
      </div>

      {/* Unit serial list */}
      {expanded && order.units.length > 0 && (
        <div className="grid grid-cols-3 gap-1 pt-1">
          {order.units.map((u) => (
            <span key={u.id} className="font-mono text-xs text-slate-300 bg-slate-800/60 rounded px-2 py-1 text-center">
              {u.serialNumber}
            </span>
          ))}
        </div>
      )}

      {/* Quantity input step */}
      {showQtyForm ? (
        <div className="rounded-lg p-3 space-y-2 mt-3" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)' }}>
          <div className="text-xs font-semibold text-sky-400">How many units in this dispatch order?</div>
          <div className="text-[11px] text-zinc-500">{order.readyCount} unit{order.readyCount !== 1 ? 's' : ''} available to dispatch</div>
          <div className="flex gap-2">
            <input
              type="number" min="1" max={order.readyCount}
              value={qtyInput} onChange={(e) => { setQtyInput(e.target.value); setQtyError(''); }}
              className="input-field text-sm flex-1"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleConfirmCreate(); } }}
              autoFocus
            />
            <button
              type="button"
              onClick={handleConfirmCreate}
              disabled={creating === order.id}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: '#0ea5e9', color: '#fff' }}
            >
              {creating === order.id ? 'Creating…' : 'Create →'}
            </button>
            <button
              type="button"
              onClick={() => { setShowQtyForm(false); setQtyError(''); setQtyInput(String(order.readyCount)); }}
              className="px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Cancel
            </button>
          </div>
          {qtyError && <p className="text-xs text-rose-400">{qtyError}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setQtyInput(String(order.readyCount)); setShowQtyForm(true); }}
          disabled={creating === order.id || order.readyCount === 0}
          className="w-full mt-3 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all"
          style={{ background: '#0ea5e9', color: '#fff' }}
        >
          {creating === order.id ? 'Creating…' : `Create Dispatch Order →`}
        </button>
      )}
    </div>
  );
}

/* ── DO Sub-row (inside an order group) ── */
function DORow({ d }: { d: DispatchOrder }) {
  const totalBoxes = d.boxes.length;
  const packedUnits = d.boxes.reduce((s, b) => s + b._count.items, 0);

  return (
    <div className="rounded-lg border px-3 py-2.5 flex items-center gap-3"
      style={{ background: 'rgba(15,23,42,0.6)', borderColor: 'rgba(148,163,184,0.08)' }}>
      {/* DO number */}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-xs font-bold text-sky-400">{d.doNumber}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          {fmt(d.createdAt)} · {d.createdBy.name}
          {d.approvedAt && d.approvedBy && (
            <span className="text-emerald-400"> · Dispatched {fmt(d.approvedAt)}</span>
          )}
        </p>
      </div>

      {/* Units packed / planned */}
      <div className="text-center px-2">
        <p className="text-xs font-semibold text-white">
          {packedUnits}
          <span className="text-slate-500 font-normal">/{d.dispatchQty}</span>
        </p>
        <p className="text-[10px] text-slate-500">units</p>
      </div>
      <div className="text-center px-2">
        <p className="text-xs font-semibold text-white">{totalBoxes}</p>
        <p className="text-[10px] text-slate-500">boxes</p>
      </div>

      {/* Status badge */}
      <span className={`text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_STYLE[d.status]}`}>
        {STATUS_LABEL[d.status]}
      </span>

      {/* Pack button — only for active DOs */}
      {['OPEN', 'PACKING'].includes(d.status) && (
        <a
          href={`/shipping/do/${d.id}`}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors whitespace-nowrap font-semibold"
          style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.25)' }}
          title="Open packing panel"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          Pack
        </a>
      )}

      {/* Print button */}
      <a
        href={`/print/dispatch-order/${d.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md transition-colors whitespace-nowrap"
        style={{ background: 'rgba(148,163,184,0.08)', color: '#94a3b8' }}
        title="Print Dispatch Order"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        Print
      </a>
    </div>
  );
}

/* ── Order Group Card ── */
function OrderGroupCard({ group }: { group: OrderGroup }) {
  const totalDispatched = group.dos
    .filter(d => d.status === 'APPROVED')
    .reduce((s, d) => s + d.boxes.reduce((bs, b) => bs + b._count.items, 0), 0);

  const activeDOs    = group.dos.filter(d => ['OPEN', 'PACKING', 'SUBMITTED'].includes(d.status));
  const completedDOs = group.dos.filter(d => ['APPROVED', 'REJECTED'].includes(d.status));
  const hasActive    = activeDOs.length > 0;

  return (
    <div className="rounded-xl border overflow-hidden"
      style={{ background: 'rgba(15,23,42,0.8)', borderColor: 'rgba(148,163,184,0.1)' }}>
      {/* Order header */}
      <div className="flex items-start justify-between gap-2 p-4 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-sm font-bold text-sky-400">{group.orderNumber}</p>
            {hasActive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/20">
                Active
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-white mt-0.5">{group.product.name}</p>
          {group.client && (
            <p className="text-xs text-slate-400 mt-0.5">{group.client.customerName}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-500">Total Qty</p>
          <p className="text-sm font-semibold text-white">{group.quantity}</p>
          {totalDispatched > 0 && (
            <p className="text-[10px] text-emerald-400 mt-0.5">{totalDispatched} dispatched</p>
          )}
        </div>
      </div>

      {/* DO sub-list */}
      <div className="px-3 pb-3 space-y-1.5">
        {/* Active DOs first */}
        {activeDOs.map(d => <DORow key={d.id} d={d} />)}

        {/* Completed DOs */}
        {completedDOs.length > 0 && (
          <>
            {activeDOs.length > 0 && (
              <p className="text-[10px] text-slate-600 uppercase tracking-wide pt-1 pb-0.5 px-1">
                History
              </p>
            )}
            {completedDOs.map(d => <DORow key={d.id} d={d} />)}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Empty State ── */
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

/* ── Main Page ── */
export default function MyDispatchPage() {
  const [tab, setTab] = useState<Tab>('topack');
  const [readyOrders, setReadyOrders] = useState<ReadyOrder[]>([]);
  const [allDOs,      setAllDOs]      = useState<DispatchOrder[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [creating,    setCreating]    = useState<string | null>(null);
  const [createError,   setCreateError]   = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [doRes, readyRes] = await Promise.all([
        fetch('/api/dispatch-orders/employee'),
        fetch('/api/shipping/ready-summary'),
      ]);
      if (!doRes.ok)    throw new Error('Failed to load dispatch orders');
      if (!readyRes.ok) throw new Error('Failed to load ready orders');

      const dos: DispatchOrder[] = await doRes.json();
      const ready: ReadyOrder[]  = await readyRes.json();

      setAllDOs(dos);
      setReadyOrders(ready);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createDO(orderId: string, dispatchQty: number) {
    setCreating(orderId);
    setCreateError('');
    setCreateSuccess('');
    try {
      const res  = await fetch('/api/dispatch-orders', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderId, dispatchQty }),
      });
      const data = await res.json() as { id?: string; doNumber?: string; existing?: boolean; error?: string };
      if (!res.ok || !data.id) {
        setCreateError(data.error ?? 'Failed to create dispatch order');
        return;
      }
      const msg = data.existing
        ? `Dispatch Order ${data.doNumber ?? ''} already exists — packing team will handle it`
        : `Dispatch Order ${data.doNumber ?? ''} created — handed off to packing team ✓`;
      setCreateSuccess(msg);
      // Auto-open the print slip in a new tab
      if (data.id) window.open(`/print/dispatch-order/${data.id}`, '_blank');
      await load();
      setTab('topack');
    } catch {
      setCreateError('Network error');
    } finally {
      setCreating(null);
    }
  }

  /* Derived groups */
  const topackDOs     = allDOs.filter(d => ['OPEN', 'PACKING'].includes(d.status));
  const processingDOs = allDOs.filter(d => d.status === 'SUBMITTED');
  const completedDOs  = allDOs.filter(d => ['APPROVED', 'REJECTED'].includes(d.status));

  const topackGroups     = groupByOrder(topackDOs);
  const processingGroups = groupByOrder(processingDOs);
  const completedGroups  = groupByOrder(completedDOs);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'topack',     label: 'To Pack',    count: readyOrders.length + topackGroups.length },
    { key: 'processing', label: 'Processing', count: processingGroups.length },
    { key: 'completed',  label: 'Completed',  count: completedGroups.length },
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
      ) : tab === 'topack' ? (
        readyOrders.length === 0 && topackGroups.length === 0 ? (
          <EmptyState
            message="No orders ready to pack"
            sub="Units must complete Final Assembly and be approved before dispatch"
          />
        ) : (
          <div className="space-y-3">
            {createSuccess && (
              <div className="rounded-xl p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                {createSuccess}
              </div>
            )}
            {createError && (
              <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {createError}
              </div>
            )}
            {/* Orders with FA-completed units — create new DOs */}
            {readyOrders.length > 0 && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-1">
                  Ready to Dispatch
                </p>
                {readyOrders.map((o) => (
                  <ReadyCard key={o.id} order={o} onCreateDO={createDO} creating={creating} />
                ))}
              </>
            )}
            {/* Existing OPEN / PACKING DOs */}
            {topackGroups.length > 0 && (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-1 pt-1">
                  In Packing
                </p>
                {topackGroups.map((g) => (
                  <OrderGroupCard key={g.orderId} group={g} />
                ))}
              </>
            )}
          </div>
        )
      ) : tab === 'processing' ? (
        processingGroups.length === 0 ? (
          <EmptyState
            message="No orders pending approval"
            sub="Submitted dispatch orders awaiting accounts review will appear here"
          />
        ) : (
          <div className="space-y-3">
            {processingGroups.map((g) => (
              <OrderGroupCard key={g.orderId} group={g} />
            ))}
          </div>
        )
      ) : (
        completedGroups.length === 0 ? (
          <EmptyState
            message="No completed dispatches yet"
            sub="Approved and rejected dispatch orders will appear here"
          />
        ) : (
          <div className="space-y-3">
            {completedGroups.map((g) => (
              <OrderGroupCard key={g.orderId} group={g} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
