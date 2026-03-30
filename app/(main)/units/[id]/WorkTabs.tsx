'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { StageWorkFlow } from '@/components/StageWorkFlow';
import { StageHistory } from '@/components/StageHistory';
import { QcChecklist } from './QcChecklist';

type ReworkRecord = {
  id: string;
  status: string;
  correctiveAction: string | null;
  rootCauseStage: string | null;
  rootCauseCategory: { name: string } | null;
  assignedUser: { name: string } | null;
  createdAt: string;
};

type Props = {
  unitId: string;
  unitSerial: string;
  stageBarcode: string | null;
  currentStage: string;
  currentStatus: string;
  isEmployee: boolean;
  role?: string;
  orderId: string | null;
  reworkRecords?: ReworkRecord[];
  productName?: string;
  orderNumber?: string;
  qcBarcode?: string | null;
  powerstageBarcode?: string | null;
  brainboardBarcode?: string | null;
};

function ReworkTab({ unitId, reworkRecords }: { unitId: string; reworkRecords: ReworkRecord[] }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  const latest = reworkRecords[0] ?? null;
  const isOpen = latest && (latest.status === 'OPEN' || latest.status === 'IN_PROGRESS');

  async function doAction(status: 'SENT_TO_QC' | 'COMPLETED') {
    setLoading(status);
    setError('');
    try {
      const res = await fetch(`/api/units/${unitId}/rework`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reworkId: latest?.id, status, correctiveAction: note || undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed');
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading('');
    }
  }

  if (!latest) {
    return <p className="text-zinc-500 text-sm">No rework record found.</p>;
  }

  const stageLabel: Record<string, string> = {
    POWERSTAGE_MANUFACTURING: 'Powerstage', BRAINBOARD_MANUFACTURING: 'Brainboard',
    CONTROLLER_ASSEMBLY: 'Assembly', QC_AND_SOFTWARE: 'QC & Software',
    FINAL_ASSEMBLY: 'Final Assembly',
  };

  return (
    <div className="space-y-4">
      {/* Rework info */}
      <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(251,146,60,0.06)', border: '1px solid rgba(251,146,60,0.2)' }}>
        {latest.rootCauseStage && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide w-24 shrink-0">Root Cause Stage</span>
            <span className="text-sm text-orange-300">{stageLabel[latest.rootCauseStage] ?? latest.rootCauseStage}</span>
          </div>
        )}
        {latest.rootCauseCategory && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide w-24 shrink-0">Issue</span>
            <span className="text-sm text-zinc-200">{latest.rootCauseCategory.name}</span>
          </div>
        )}
        {latest.correctiveAction && (
          <div className="flex items-start gap-2">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wide w-24 shrink-0 mt-0.5">Action Taken</span>
            <span className="text-sm text-zinc-300">{latest.correctiveAction}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide w-24 shrink-0">Status</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${latest.status === 'OPEN' ? 'text-orange-400 bg-orange-400/10' : latest.status === 'SENT_TO_QC' ? 'text-sky-400 bg-sky-400/10' : 'text-green-400 bg-green-400/10'}`}>
            {latest.status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Actions — only for open reworks */}
      {isOpen && (
        <div className="space-y-3">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe corrective action taken…"
            rows={3}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0' }}
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => doAction('SENT_TO_QC')}
              disabled={!!loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.3)' }}
            >
              {loading === 'SENT_TO_QC' ? 'Sending…' : 'Send to QC ↗'}
            </button>
            <button
              type="button"
              onClick={() => doAction('COMPLETED')}
              disabled={!!loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}
            >
              {loading === 'COMPLETED' ? 'Saving…' : <>Mark Complete <Check className="w-4 h-4 ml-1 inline" /></>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function WorkTabs({ unitId, unitSerial, stageBarcode, currentStage, currentStatus, isEmployee, role, orderId, reworkRecords = [], productName, orderNumber, qcBarcode, powerstageBarcode, brainboardBarcode }: Props) {
  const canDoQC = ['ADMIN', 'PRODUCTION_MANAGER', 'QC_USER'].includes(role ?? '');
  const isRework = currentStage === 'REWORK';
  const defaultTab = isRework ? 'rework' : isEmployee ? 'work' : 'history';
  const [tab, setTab] = useState<'work' | 'history' | 'rework'>(defaultTab);

  return (
    <div className="card overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {isEmployee && !isRework && (
          <button
            type="button"
            onClick={() => setTab('work')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'work' ? 'text-sky-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === 'work' ? { borderBottom: '2px solid #38bdf8', marginBottom: -1 } : {}}
          >
            Open Work
          </button>
        )}
        {isRework && (
          <button
            type="button"
            onClick={() => setTab('rework')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'rework' ? 'text-orange-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === 'rework' ? { borderBottom: '2px solid #fb923c', marginBottom: -1 } : {}}
          >
            Rework
          </button>
        )}
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'history' ? 'text-sky-400' : 'text-zinc-500 hover:text-zinc-300'}`}
          style={tab === 'history' ? { borderBottom: '2px solid #38bdf8', marginBottom: -1 } : {}}
        >
          History
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {tab === 'rework' && (
          <ReworkTab unitId={unitId} reworkRecords={reworkRecords} />
        )}
        {tab === 'work' && currentStage === 'QC_AND_SOFTWARE' && canDoQC && (
          <QcChecklist
            unitId={unitId}
            currentStatus={currentStatus}
            serialNumber={unitSerial}
            productName={productName ?? ''}
            orderNumber={orderNumber ?? ''}
            qcBarcode={qcBarcode ?? null}
          />
        )}
        {tab === 'work' && isEmployee && currentStage !== 'QC_AND_SOFTWARE' && (
          <StageWorkFlow
            unitId={unitId}
            unitSerial={unitSerial}
            stageBarcode={stageBarcode}
            currentStage={currentStage}
            currentStatus={currentStatus}
            orderId={orderId}
            powerstageBarcode={powerstageBarcode}
            brainboardBarcode={brainboardBarcode}
          />
        )}
        {tab === 'history' && (
          <StageHistory unitId={unitId} />
        )}
      </div>
    </div>
  );
}
