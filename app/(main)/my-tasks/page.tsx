'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

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
  myJobCard: { orderId: string; stage: string; status: string } | null;
}

interface Assignment {
  id: string;
  stage: string;
  unit: {
    id: string;
    serialNumber: string;
    currentStatus: string;
    order: {
      id: string;
      orderNumber: string;
      quantity: number;
      product: { name: string; code: string };
    };
  };
}

const STAGE_LABEL: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage Mfg',
  BRAINBOARD_MANUFACTURING: 'Brainboard Mfg',
  CONTROLLER_ASSEMBLY: 'Controller Assembly',
  QC_AND_SOFTWARE: 'QC & Software',
  REWORK: 'Rework',
  FINAL_ASSEMBLY: 'Final Assembly',
};

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  PENDING:          { bg: 'rgba(251,191,36,0.08)',  text: '#fbbf24' },
  IN_PROGRESS:      { bg: 'rgba(14,165,233,0.08)',  text: '#38bdf8' },
  WAITING_APPROVAL: { bg: 'rgba(168,85,247,0.08)',  text: '#c084fc' },
  COMPLETED:        { bg: 'rgba(34,197,94,0.08)',   text: '#4ade80' },
  APPROVED:         { bg: 'rgba(34,197,94,0.08)',   text: '#4ade80' },
};

const JC_STATUS_COLOR: Record<string, { label: string; bg: string; text: string }> = {
  PENDING:     { label: '⏳ Waiting for Materials', bg: 'rgba(251,191,36,0.1)',  text: '#fbbf24' },
  DISPATCHED:  { label: '✓ Materials Dispatched',   bg: 'rgba(34,197,94,0.1)',   text: '#4ade80' },
  IN_PROGRESS: { label: '⚙ In Progress',            bg: 'rgba(14,165,233,0.1)',  text: '#38bdf8' },
  COMPLETED:   { label: '✅ Completed',              bg: 'rgba(34,197,94,0.1)',   text: '#4ade80' },
};

export default function MyTasksPage() {
  const [tab, setTab] = useState<'pending' | 'active'>('pending');

  // Pending tab: available orders from the queue
  const [availableOrders, setAvailableOrders] = useState<AvailableOrder[]>([]);
  // Active tab: assignments with IN_PROGRESS units
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const [loading, setLoading]   = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null); // orderId:stage

  const load = useCallback(async () => {
    setLoading(true);
    const [avRes, aRes] = await Promise.all([
      fetch('/api/production/available-orders'),
      fetch('/api/my-assignments'),
    ]);
    if (avRes.ok) setAvailableOrders(await avRes.json());
    if (aRes.ok)  setAssignments(await aRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function acceptOrder(orderId: string, stage: string) {
    const key = `${orderId}:${stage}`;
    setAccepting(key);
    const res = await fetch('/api/inventory/job-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, stage }),
    });
    setAccepting(null);
    if (res.ok) await load();
  }

  const activeAssignments = assignments.filter(a => a.unit.currentStatus === 'IN_PROGRESS');

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-24">
      <div className="pt-6 pb-4">
        <h1 className="text-white text-xl font-bold">My Tasks</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Your assigned production work</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <button onClick={() => setTab('pending')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'pending' ? 'bg-sky-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
          Pending {availableOrders.length > 0 ? `(${availableOrders.length})` : ''}
        </button>
        <button onClick={() => setTab('active')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'active' ? 'bg-sky-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
          Active {activeAssignments.length > 0 ? `(${activeAssignments.length})` : ''}
        </button>
      </div>

      {/* ── Pending Tab ── */}
      {tab === 'pending' && (
        <div className="space-y-3">
          {availableOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-zinc-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-4xl mb-3">✅</div>
              <p className="text-zinc-400 text-sm">No pending orders</p>
              <p className="text-zinc-600 text-xs mt-1">All orders are in progress or completed</p>
            </div>
          ) : (
            availableOrders.map(order => {
              const key       = `${order.orderId}:${order.stage}`;
              const isLoading = accepting === key;
              const jcStatus  = order.myJobCard?.status ?? null;
              const jcInfo    = jcStatus ? JC_STATUS_COLOR[jcStatus] : null;

              return (
                <div key={order.orderId} className="rounded-xl overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Order number + stage */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold font-mono text-sm">{order.orderNumber}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                            {STAGE_LABEL[order.stage] ?? order.stage.replace(/_/g, ' ')}
                          </span>
                          {jcInfo && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: jcInfo.bg, color: jcInfo.text }}>
                              {jcInfo.label}
                            </span>
                          )}
                        </div>

                        {/* Product + qty */}
                        <p className="text-zinc-400 text-xs mt-1.5">
                          {order.product.name}
                          {order.voltage && <span className="text-zinc-500"> · {order.voltage}</span>}
                          {' · '}<span className="text-zinc-300">{order.pendingUnitCount} unit{order.pendingUnitCount !== 1 ? 's' : ''} pending</span>
                        </p>

                        {/* Due date */}
                        {order.dueDate && (
                          <p className="text-zinc-600 text-[10px] mt-0.5">
                            Due: {new Date(order.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>

                      {/* Action button */}
                      <div className="shrink-0">
                        {!order.alreadyAccepted ? (
                          <button
                            onClick={() => acceptOrder(order.orderId, order.stage)}
                            disabled={isLoading}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                            style={{ background: isLoading ? 'rgba(14,165,233,0.3)' : 'rgba(14,165,233,0.8)' }}>
                            {isLoading ? 'Accepting…' : 'Accept Order'}
                          </button>
                        ) : jcStatus === 'DISPATCHED' ? (
                          <Link href={`/orders/${order.orderId}`}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white text-center block"
                            style={{ background: 'rgba(34,197,94,0.8)' }}>
                            Start Work →
                          </Link>
                        ) : (
                          <span className="text-zinc-600 text-xs px-2">Waiting…</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Active Tab ── */}
      {tab === 'active' && (
        <div className="space-y-3">
          {activeAssignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-zinc-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-4xl mb-3">⚙️</div>
              <p className="text-zinc-400 text-sm">No active work</p>
              <p className="text-zinc-600 text-xs mt-1">Accept an order from the Pending tab</p>
            </div>
          ) : (
            activeAssignments.map(a => {
              const sc = STATUS_COLOR[a.unit.currentStatus] ?? { bg: 'rgba(255,255,255,0.04)', text: '#71717a' };
              const stageLabel = STAGE_LABEL[a.stage] ?? a.stage.replace(/_/g, ' ');
              return (
                <Link key={a.id} href={`/units/${a.unit.id}`}
                  className="block rounded-xl p-4 transition-colors hover:border-sky-700"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-semibold font-mono text-sm">{a.unit.serialNumber}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{stageLabel}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: sc.bg, color: sc.text }}>
                          {a.unit.currentStatus.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p className="text-zinc-400 text-xs mt-1.5">
                        {a.unit.order.product.name}
                        {' · '}Order <span className="text-zinc-300">{a.unit.order.orderNumber}</span>
                      </p>
                    </div>
                    <div className="text-sky-400 text-sm shrink-0">→</div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
