'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Check, Clock } from 'lucide-react';

type UnitSummary = { currentStatus: string; currentStage: string };

export type OrderItem = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  voltage?: string | null;
  product: { name: string; code: string };
  client?: { id: string; code: string; customerName: string } | null;
  _count: { units: number };
  units: UnitSummary[];
  hasMyJobCard?: boolean; // true if employee has accepted this order (has a job card)
};

interface AvailableOrder {
  orderId: string;
  orderNumber: string;
  quantity: number;
  dueDate: string | null;
  voltage: string | null;
  product: { id: string; name: string; code: string };
  pendingUnitCount: number;
  stage: string;
  alreadyAccepted: boolean;
  myJobCard: { id: string; orderId: string; stage: string; status: string } | null;
}

const STAGE_LABEL: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage',
  BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY: 'Assembly',
  QC_AND_SOFTWARE: 'QC & Software',
  REWORK: 'Rework',
  FINAL_ASSEMBLY: 'Final Assembly',
};

const JC_STATUS: Record<string, { label: ReactNode; color: string }> = {
  PENDING:     { label: <><Clock className="w-4 h-4 mr-1 inline" />Waiting for Materials</>, color: '#fbbf24' },
  DISPATCHED:  { label: <><Check className="w-4 h-4 mr-1 inline" />Materials Dispatched</>,  color: '#4ade80' },
  IN_PROGRESS: { label: '⚙ In Progress',           color: '#38bdf8' },
  COMPLETED:   { label: '✅ Completed',             color: '#4ade80' },
};

export function OrdersList({ orders, isManager, sessionRole }: {
  orders: OrderItem[];
  isManager: boolean;
  sessionRole: string;
}) {
  const isEmployee = sessionRole === 'PRODUCTION_EMPLOYEE';
  const [tab, setTab] = useState<'pending' | 'processing' | 'completed'>(
    isEmployee ? 'pending' : 'processing'
  );

  // Pending tab state (employee only)
  const [availableOrders, setAvailableOrders] = useState<AvailableOrder[]>([]);
  const [loadingPending, setLoadingPending]   = useState(false);
  const [accepting, setAccepting]             = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    const res = await fetch('/api/production/available-orders');
    if (res.ok) setAvailableOrders(await res.json());
    setLoadingPending(false);
  }, []);

  useEffect(() => {
    if (isEmployee && tab === 'pending') loadPending();
  }, [isEmployee, tab, loadPending]);

  const [acceptError, setAcceptError] = useState('');

  async function acceptOrder(orderId: string, stage: string) {
    setAcceptError('');
    setAccepting(`${orderId}:${stage}`);
    const res = await fetch('/api/inventory/job-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, stage }),
    });
    setAccepting(null);
    if (res.ok) {
      await loadPending();
    } else {
      const data = await res.json().catch(() => ({ error: 'Failed to accept order' }));
      setAcceptError(data.error || 'Failed to accept order');
    }
  }

  const allUnitsDone = (o: OrderItem) =>
    o.units.length > 0 &&
    o.units.every(u => u.currentStatus === 'COMPLETED' || u.currentStatus === 'APPROVED');

  const processing = orders.filter((o) => {
    if (o.status !== 'ACTIVE') return false;
    if (allUnitsDone(o)) return false;
    // For employees: show in Processing if they accepted the order (have job card)
    // OR if any unit has started work
    if (isEmployee) return o.hasMyJobCard || o.units.some(u => u.currentStatus !== 'PENDING');
    return true;
  });
  const completed = orders.filter((o) => o.status !== 'ACTIVE' || allUnitsDone(o));

  const tabs = isEmployee
    ? [
        { key: 'pending'    as const, label: `Pending (${availableOrders.length})` },
        { key: 'processing' as const, label: `Processing (${processing.length})` },
        { key: 'completed'  as const, label: `Completed (${completed.length})` },
      ]
    : [
        { key: 'processing' as const, label: `Processing (${processing.length})` },
        { key: 'completed'  as const, label: `Completed (${completed.length})` },
      ];

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-4"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === t.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Pending tab — employee only */}
      {tab === 'pending' && (
        <div className="space-y-2">
          {acceptError && (
            <div className="p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {acceptError}
            </div>
          )}
          {loadingPending ? (
            <div className="flex justify-center py-10">
              <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : availableOrders.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm">No pending orders.</p>
              <p className="text-zinc-600 text-xs mt-1">All orders are being processed.</p>
            </div>
          ) : (
            availableOrders.map(order => {
              const key       = `${order.orderId}:${order.stage}`;
              const isLoading = accepting === key;
              const jc        = order.myJobCard;
              const jcInfo    = jc ? JC_STATUS[jc.status] : null;

              return (
                <div key={order.orderId} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm">{order.orderNumber}</span>
                        {jcInfo && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: 'rgba(255,255,255,0.06)', color: jcInfo.color }}>
                            {jcInfo.label}
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-500 text-sm mt-1">
                        {order.product.name}
                        {order.voltage && <span> · {order.voltage}</span>}
                        {' · '}<span className="text-zinc-400">{order.pendingUnitCount} unit{order.pendingUnitCount !== 1 ? 's' : ''} pending</span>
                      </p>
                      {order.dueDate && (
                        <p className="text-zinc-600 text-xs mt-0.5">
                          Due: {new Date(order.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0">
                      {!order.alreadyAccepted ? (
                        <button
                          onClick={() => acceptOrder(order.orderId, order.stage)}
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                          style={{ background: isLoading ? 'rgba(14,165,233,0.3)' : 'rgba(14,165,233,0.8)' }}>
                          {isLoading ? 'Accepting…' : 'Accept Order'}
                        </button>
                      ) : jc?.status === 'DISPATCHED' ? (
                        <Link href={`/orders/${order.orderId}`}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white text-center block"
                          style={{ background: 'rgba(34,197,94,0.8)' }}>
                          Start Work →
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-600 text-xs">Waiting…</span>
                          {jc?.id && (
                            <a href={`/print/job-card/${jc.id}`} target="_blank" rel="noreferrer"
                              className="text-zinc-500 hover:text-white text-sm px-2 py-1 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors"
                              title="Print Job Card">🖨</a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Processing / Completed tabs */}
      {(tab === 'processing' || tab === 'completed') && (
        <div className="space-y-2">
          {(tab === 'processing' ? processing : completed).length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm">No {tab} orders.</p>
              {isManager && tab === 'processing' && (
                <p className="text-zinc-600 text-xs mt-1">Create a new order to get started.</p>
              )}
            </div>
          ) : (
            (tab === 'processing' ? processing : completed).map((o) => <OrderCard key={o.id} order={o} />)
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: OrderItem }) {
  const total      = order._count.units;
  const completed  = order.units.filter((u) => u.currentStatus === 'COMPLETED' || u.currentStatus === 'APPROVED').length;
  const inProgress = order.units.filter((u) => u.currentStatus === 'IN_PROGRESS').length;
  const blocked    = order.units.filter((u) => u.currentStatus === 'BLOCKED').length;
  const pct        = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isNew      = Date.now() - new Date(order.createdAt).getTime() < 24 * 60 * 60 * 1000;

  return (
    <Link href={`/orders/${order.id}`} className="card-interactive block p-4">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-sm">{order.orderNumber}</span>
          {isNew && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(56,189,248,0.2)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
              NEW
            </span>
          )}
          {blocked > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
              {blocked} BLOCKED
            </span>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${order.status === 'ACTIVE' ? 'text-green-400' : 'text-zinc-500'}`}
          style={order.status === 'ACTIVE'
            ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }
            : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {order.status}
        </span>
      </div>

      <p className="text-zinc-500 text-sm">
        {order.product.name}
        {order.voltage ? ` · ${order.voltage}` : ''}
        {' · '}{total} unit{total !== 1 ? 's' : ''}
        {order.client ? ` · ${order.client.customerName}` : ''}
      </p>

      {total > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-zinc-600 mb-1.5">
            <span>{completed} done{inProgress > 0 ? ` · ${inProgress} active` : ''}</span>
            <span className={pct === 100 ? 'text-green-400 font-medium' : ''}>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: pct === 100
                  ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                  : pct > 50
                  ? 'linear-gradient(90deg,#38bdf8,#0ea5e9)'
                  : 'linear-gradient(90deg,#6366f1,#38bdf8)',
              }} />
          </div>
        </div>
      )}
    </Link>
  );
}
