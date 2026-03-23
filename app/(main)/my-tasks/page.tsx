'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

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

interface JobCard {
  id: string;
  cardNumber: string;
  status: string;
  orderId: string;
  stage: string;
  orderQuantity: number;
  items: { id: string; rawMaterial: { name: string; unit: string }; quantityReq: number }[];
}

const STAGE_LABEL: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage',
  BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY: 'Assembly',
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

export default function MyTasksPage() {
  const [tab, setTab] = useState<'pending' | 'active'>('pending');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null); // key = orderId:stage

  const load = useCallback(async () => {
    setLoading(true);
    const [aRes, jRes] = await Promise.all([
      fetch('/api/my-assignments'),
      fetch('/api/inventory/job-cards'),
    ]);
    if (aRes.ok) setAssignments(await aRes.json());
    if (jRes.ok) setJobCards(await jRes.json());
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

  // Group pending assignments by orderId:stage
  const pending = assignments.filter(a => ['PENDING', 'WAITING_APPROVAL'].includes(a.unit.currentStatus));
  const active  = assignments.filter(a => a.unit.currentStatus === 'IN_PROGRESS');

  // Group pending by order+stage
  const pendingGroups: Record<string, { orderId: string; stage: string; orderNumber: string; productName: string; units: Assignment[] }> = {};
  for (const a of pending) {
    const key = `${a.unit.order.id}:${a.stage}`;
    if (!pendingGroups[key]) {
      pendingGroups[key] = {
        orderId: a.unit.order.id,
        stage: a.stage,
        orderNumber: a.unit.order.orderNumber,
        productName: a.unit.order.product.name,
        units: [],
      };
    }
    pendingGroups[key].units.push(a);
  }

  function getJobCard(orderId: string, stage: string) {
    return jobCards.find(jc => jc.orderId === orderId && jc.stage === stage) ?? null;
  }

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
        {(['pending', 'active'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? 'bg-sky-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
            {t === 'pending' ? `Pending${pending.length > 0 ? ` (${Object.keys(pendingGroups).length})` : ''}` : `Active${active.length > 0 ? ` (${active.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Pending Tab */}
      {tab === 'pending' && (
        <div className="space-y-3">
          {Object.keys(pendingGroups).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-zinc-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-4xl mb-3">✅</div>
              <p className="text-zinc-400 text-sm">No pending orders</p>
              <p className="text-zinc-600 text-xs mt-1">You're all caught up</p>
            </div>
          ) : (
            Object.values(pendingGroups).map(group => {
              const key       = `${group.orderId}:${group.stage}`;
              const jc        = getJobCard(group.orderId, group.stage);
              const isAccept  = accepting === key;
              const stageLabel = STAGE_LABEL[group.stage] ?? group.stage.replace(/_/g, ' ');

              return (
                <div key={key} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-semibold font-mono text-sm">{group.orderNumber}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">{stageLabel}</span>
                          {jc && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${jc.status === 'DISPATCHED' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-amber-900/30 text-amber-400'}`}>
                              {jc.status === 'DISPATCHED' ? '✓ Materials Dispatched' : '⏳ Waiting for Materials'}
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-400 text-xs mt-1.5">
                          {group.productName}
                          {' · '}<span className="text-zinc-300">{group.units.length} unit{group.units.length !== 1 ? 's' : ''}</span>
                        </p>
                        {jc && (
                          <p className="text-zinc-600 text-[10px] mt-1 font-mono">{jc.cardNumber}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        {!jc ? (
                          <button
                            onClick={() => acceptOrder(group.orderId, group.stage)}
                            disabled={isAccept}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                            style={{ background: isAccept ? 'rgba(14,165,233,0.3)' : 'rgba(14,165,233,0.8)' }}>
                            {isAccept ? 'Accepting…' : 'Accept Order'}
                          </button>
                        ) : jc.status === 'DISPATCHED' ? (
                          <Link href={`/units/${group.units[0].unit.id}`}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white text-center block"
                            style={{ background: 'rgba(34,197,94,0.8)' }}>
                            Verify & Start →
                          </Link>
                        ) : (
                          <span className="text-zinc-600 text-xs">Waiting…</span>
                        )}
                      </div>
                    </div>

                    {/* Units list */}
                    <div className="mt-3 space-y-1">
                      {group.units.map(a => {
                        const sc = STATUS_COLOR[a.unit.currentStatus] ?? { bg: 'rgba(255,255,255,0.04)', text: '#71717a' };
                        return (
                          <Link key={a.id} href={`/units/${a.unit.id}`}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                            style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <span className="text-zinc-300 font-mono text-xs flex-1">{a.unit.serialNumber}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: sc.bg, color: sc.text }}>
                              {a.unit.currentStatus.replace(/_/g, ' ')}
                            </span>
                          </Link>
                        );
                      })}
                    </div>

                    {jc && jc.items.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-zinc-800/60">
                        <p className="text-zinc-600 text-[10px] mb-1.5">{jc.items.length} components requested</p>
                        <div className="space-y-0.5">
                          {jc.items.slice(0, 3).map((item, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="text-zinc-500 flex-1 truncate">{item.rawMaterial.name}</span>
                              <span className="text-amber-300 shrink-0">{item.quantityReq} {item.rawMaterial.unit}</span>
                            </div>
                          ))}
                          {jc.items.length > 3 && (
                            <p className="text-zinc-700 text-[10px]">+{jc.items.length - 3} more</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Active Tab */}
      {tab === 'active' && (
        <div className="space-y-3">
          {active.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-zinc-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-4xl mb-3">⚙️</div>
              <p className="text-zinc-400 text-sm">No active work</p>
              <p className="text-zinc-600 text-xs mt-1">Accept an order from the Pending tab to get started</p>
            </div>
          ) : (
            active.map(a => {
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
