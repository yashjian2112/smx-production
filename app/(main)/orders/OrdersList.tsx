'use client';

import Link from 'next/link';
import { useState } from 'react';

type UnitSummary = { currentStatus: string; currentStage: string };

export type OrderItem = {
  id: string;
  orderNumber: string;
  status: string;
  createdAt: string;
  voltage?: string | null;
  product: { name: string; code: string };
  _count: { units: number };
  units: UnitSummary[];
};

export function OrdersList({ orders, isManager }: { orders: OrderItem[]; isManager: boolean }) {
  const [tab, setTab] = useState<'processing' | 'completed'>('processing');

  const processing = orders.filter((o) => o.status === 'ACTIVE');
  const completed = orders.filter((o) => o.status !== 'ACTIVE');
  const list = tab === 'processing' ? processing : completed;

  return (
    <div>
      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl mb-4"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        {(['processing', 'completed'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === t ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            style={
              tab === t
                ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' }
                : {}
            }
          >
            {t === 'processing' ? `Processing (${processing.length})` : `Completed (${completed.length})`}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2">
        {list.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-zinc-500 text-sm">No {tab} orders.</p>
            {isManager && tab === 'processing' && (
              <p className="text-zinc-600 text-xs mt-1">Create a new order to get started.</p>
            )}
          </div>
        ) : (
          list.map((o) => <OrderCard key={o.id} order={o} />)
        )}
      </div>
    </div>
  );
}

function OrderCard({ order }: { order: OrderItem }) {
  const total = order._count.units;
  const completed = order.units.filter((u) => u.currentStatus === 'COMPLETED').length;
  const inProgress = order.units.filter((u) => u.currentStatus === 'IN_PROGRESS').length;
  const blocked = order.units.filter((u) => u.currentStatus === 'BLOCKED').length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isNew = Date.now() - new Date(order.createdAt).getTime() < 24 * 60 * 60 * 1000;

  return (
    <Link href={`/orders/${order.id}`} className="card-interactive block p-4">
      {/* Header row */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-sm">{order.orderNumber}</span>
          {isNew && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(56,189,248,0.2)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}
            >
              NEW
            </span>
          )}
          {blocked > 0 && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              {blocked} BLOCKED
            </span>
          )}
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
            order.status === 'ACTIVE' ? 'text-green-400' : 'text-zinc-500'
          }`}
          style={
            order.status === 'ACTIVE'
              ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }
              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
          }
        >
          {order.status}
        </span>
      </div>

      {/* Subtitle */}
      <p className="text-zinc-500 text-sm">
        {order.product.name}
        {order.voltage ? ` · ${order.voltage}` : ''}
        {' · '}
        {total} unit{total !== 1 ? 's' : ''}
      </p>

      {/* Progress bar */}
      {total > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-zinc-600 mb-1.5">
            <span>
              {completed} done
              {inProgress > 0 ? ` · ${inProgress} active` : ''}
            </span>
            <span className={pct === 100 ? 'text-green-400 font-medium' : ''}>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background:
                  pct === 100
                    ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                    : pct > 50
                    ? 'linear-gradient(90deg,#38bdf8,#0ea5e9)'
                    : 'linear-gradient(90deg,#6366f1,#38bdf8)',
              }}
            />
          </div>
        </div>
      )}
    </Link>
  );
}
