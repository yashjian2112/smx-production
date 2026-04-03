'use client';

import { CheckCircle2, XCircle, FileText } from 'lucide-react';
import type { HarnessUnit } from './types';

export function QCReport({ unit }: { unit: HarnessUnit }) {
  const qcData = unit.qcData;
  if (!qcData) return null;

  const entries = Object.entries(qcData);
  const allPassed = entries.every(([, v]) => v.status === 'PASS');
  const failedCount = entries.filter(([, v]) => v.status === 'FAIL').length;

  return (
    <div className={`mt-3 p-4 rounded-xl border space-y-3 ${
      allPassed
        ? 'bg-emerald-950/20 border-emerald-500/20'
        : 'bg-red-950/20 border-red-500/20'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className={`w-4 h-4 ${allPassed ? 'text-emerald-400' : 'text-red-400'}`} />
          <p className={`text-xs font-semibold ${allPassed ? 'text-emerald-400' : 'text-red-400'}`}>
            QC Report — {allPassed ? 'PASSED' : `FAILED (${failedCount})`}
          </p>
        </div>
        {unit.barcode && (
          <span className="text-[10px] text-slate-500 font-mono">{unit.barcode}</span>
        )}
      </div>
      <div className="space-y-1">
        {entries.map(([connId, result]) => (
          <div key={connId} className="flex items-center gap-2 py-1">
            {result.status === 'PASS' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            )}
            <span className={`text-xs ${result.status === 'PASS' ? 'text-slate-300' : 'text-red-300'}`}>
              {result.name || connId.slice(0, 8)}
            </span>
            <span className={`text-[10px] font-semibold ${result.status === 'PASS' ? 'text-emerald-400' : 'text-red-400'}`}>
              {result.status}
            </span>
            {result.remarks && (
              <span className="text-[10px] text-slate-500 italic ml-1">— {result.remarks}</span>
            )}
          </div>
        ))}
      </div>
      {unit.remarks && (
        <p className="text-[10px] text-slate-400 pt-2 border-t border-slate-700/50">{unit.remarks}</p>
      )}
    </div>
  );
}
