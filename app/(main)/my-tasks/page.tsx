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

export default function MyTasksPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/my-assignments');
    if (res.ok) setAssignments(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = assignments.filter(a => a.unit.currentStatus === 'IN_PROGRESS');

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
        <p className="text-zinc-500 text-sm mt-0.5">Your active production work</p>
      </div>

      <div className="space-y-3">
        {active.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-zinc-700"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-4xl mb-3">⚙️</div>
            <p className="text-zinc-400 text-sm">No active work</p>
            <p className="text-zinc-600 text-xs mt-1">
              Accept an order from the{' '}
              <Link href="/orders" className="text-sky-400 underline">Orders</Link> tab
            </p>
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
    </div>
  );
}
