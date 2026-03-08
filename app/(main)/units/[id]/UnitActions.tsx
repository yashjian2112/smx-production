'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FaceGate } from '@/components/FaceGate';

type Unit = {
  id: string;
  currentStage: string;
  currentStatus: string;
};

export function UnitActions({ unit, sessionRole: _sessionRole }: { unit: Unit; sessionRole: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState('');
  const [remarks, setRemarks] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function runAction(action: string) {
    setPendingAction(null);
    setLoading(action);
    try {
      await fetch(`/api/units/${unit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action, remarks: remarks || undefined }),
      });
      router.refresh();
    } finally { setLoading(''); }
  }

  const canWork = unit.currentStatus === 'PENDING' || unit.currentStatus === 'IN_PROGRESS';

  return (
    <div className="space-y-3">
      <label className="block text-sm text-slate-400">Remarks</label>
      <input
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder="Optional notes"
        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm"
      />
      {canWork && (
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setPendingAction('IN_PROGRESS')}
            disabled={!!loading}
            className="py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 tap-target disabled:opacity-50"
          >
            In progress
          </button>
          <button
            type="button"
            onClick={() => setPendingAction('COMPLETED')}
            disabled={!!loading}
            className="py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 tap-target disabled:opacity-50"
          >
            Complete
          </button>
          <button
            type="button"
            onClick={() => setPendingAction('BLOCKED')}
            disabled={!!loading}
            className="py-2 px-4 rounded-lg border border-red-500 text-red-400 hover:bg-red-500/20 tap-target disabled:opacity-50"
          >
            Block
          </button>
        </div>
      )}

      {pendingAction && (
        <FaceGate
          mode="verify"
          title="Verify your identity"
          onVerified={() => runAction(pendingAction)}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
