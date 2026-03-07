'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Unit = {
  id: string;
  currentStage: string;
  currentStatus: string;
};

export function UnitActions({ unit, sessionRole }: { unit: Unit; sessionRole: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState('');
  const [remarks, setRemarks] = useState('');
  const isManager = sessionRole === 'ADMIN' || sessionRole === 'PRODUCTION_MANAGER';

  async function updateStatus(status: string) {
    setLoading(status);
    try {
      await fetch(`/api/units/${unit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, remarks: remarks || undefined }),
      });
      router.refresh();
    } finally {
      setLoading('');
    }
  }

  async function approve() {
    setLoading('approve');
    try {
      await fetch(`/api/units/${unit.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      router.refresh();
    } finally {
      setLoading('');
    }
  }

  async function reject() {
    setLoading('reject');
    try {
      await fetch(`/api/units/${unit.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      });
      router.refresh();
    } finally {
      setLoading('');
    }
  }

  const canWork = unit.currentStatus === 'PENDING' || unit.currentStatus === 'IN_PROGRESS' || unit.currentStatus === 'REJECTED_BACK';
  const waitingApproval = unit.currentStatus === 'WAITING_APPROVAL';

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
            onClick={() => updateStatus('IN_PROGRESS')}
            disabled={!!loading}
            className="py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 tap-target disabled:opacity-50"
          >
            In progress
          </button>
          <button
            type="button"
            onClick={() => updateStatus('COMPLETED')}
            disabled={!!loading}
            className="py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 tap-target disabled:opacity-50"
          >
            Complete & submit
          </button>
          <button
            type="button"
            onClick={() => updateStatus('BLOCKED')}
            disabled={!!loading}
            className="py-2 px-4 rounded-lg border border-red-500 text-red-400 hover:bg-red-500/20 tap-target disabled:opacity-50"
          >
            Block
          </button>
        </div>
      )}
      {waitingApproval && isManager && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={approve}
            disabled={!!loading}
            className="flex-1 py-3 rounded-lg bg-green-600 hover:bg-green-500 font-medium tap-target disabled:opacity-50"
          >
            Approve → Next stage
          </button>
          <button
            type="button"
            onClick={reject}
            disabled={!!loading}
            className="py-3 px-4 rounded-lg border border-red-500 text-red-400 hover:bg-red-500/20 tap-target disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
