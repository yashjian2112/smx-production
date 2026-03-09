'use client';

import { useState } from 'react';
import { StageWorkFlow } from '@/components/StageWorkFlow';
import { StageHistory } from '@/components/StageHistory';

type Props = {
  unitId: string;
  unitSerial: string;
  stageBarcode: string | null;   // physical barcode for current stage
  currentStage: string;
  currentStatus: string;
  isEmployee: boolean;
};

export function WorkTabs({ unitId, unitSerial, stageBarcode, currentStage, currentStatus, isEmployee }: Props) {
  const [tab, setTab] = useState<'work' | 'history'>(isEmployee ? 'work' : 'history');

  return (
    <div className="card overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        {isEmployee && (
          <button
            type="button"
            onClick={() => setTab('work')}
            className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'work' ? 'text-sky-400' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === 'work' ? { borderBottom: '2px solid #38bdf8', marginBottom: -1 } : {}}
          >
            Work
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
        {tab === 'work' && isEmployee && (
          <StageWorkFlow
            unitId={unitId}
            unitSerial={unitSerial}
            stageBarcode={stageBarcode}
            currentStage={currentStage}
            currentStatus={currentStatus}
          />
        )}
        {tab === 'history' && (
          <StageHistory unitId={unitId} />
        )}
      </div>
    </div>
  );
}
