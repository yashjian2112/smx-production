'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FaceGate } from '@/components/FaceGate';

type Unit = {
  id: string;
  currentStage: string;
  currentStatus: string;
};

export function UnitActions({ unit, sessionRole }: { unit: Unit; sessionRole: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState('');
  const [remarks, setRemarks] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isEmployee = sessionRole === 'PRODUCTION_MANAGER';

  // Employees cannot manually override status — the work flow handles it automatically
  if (isEmployee) return null;

  async function runAction(action: string) {
    setPendingAction(null);
    setLoading(action);
    setError('');
    try {
      const res = await fetch(`/api/units/${unit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action, remarks: remarks || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError('Network error — please try again.');
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
            className="py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 tap-target disabled:opacity-50 text-sm text-white"
          >
            {loading === 'IN_PROGRESS' ? 'Saving…' : 'In Progress'}
          </button>
          <button
            type="button"
            onClick={() => setPendingAction('COMPLETED')}
            disabled={!!loading}
            className="py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 tap-target disabled:opacity-50 text-sm text-white"
          >
            {loading === 'COMPLETED' ? 'Saving…' : 'Complete'}
          </button>
          <button
            type="button"
            onClick={() => setPendingAction('BLOCKED')}
            disabled={!!loading}
            className="py-2 px-4 rounded-lg border border-red-500 text-red-400 hover:bg-red-500/20 tap-target disabled:opacity-50 text-sm"
          >
            {loading === 'BLOCKED' ? 'Saving…' : 'Block'}
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-400">{error}</p>
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
