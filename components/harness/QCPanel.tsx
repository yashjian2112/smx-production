'use client';

import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type { Connector, QCResult } from './types';

/**
 * QC Connector Test Panel
 *
 * CRITICAL FIX: All connectors start with status = null (untested).
 * Submit is BLOCKED until every connector has been explicitly marked PASS or FAIL.
 * This prevents the old auto-pass bug where operators could submit without checking.
 */
export function QCPanel({
  connectors,
  qcResults,
  setQcResults,
  onSubmit,
  onCancel,
  submitting,
  title,
}: {
  connectors: Connector[];
  qcResults: Record<string, QCResult>;
  setQcResults: React.Dispatch<React.SetStateAction<Record<string, QCResult>>>;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  title?: string;
}) {
  if (connectors.length === 0) {
    return (
      <div className="mt-3 p-4 rounded-xl bg-zinc-900/80 border border-amber-500/30">
        <div className="flex items-center gap-2 text-amber-400">
          <AlertTriangle className="w-4 h-4" />
          <p className="text-xs font-medium">No connectors configured for this product.</p>
        </div>
        <p className="text-xs text-slate-500 mt-1">Contact Admin to set up Harness Connectors.</p>
      </div>
    );
  }

  const testedCount = Object.values(qcResults).filter(r => r.status !== null).length;
  const totalCount = connectors.length;
  const allTested = testedCount === totalCount;
  const allPass = allTested && Object.values(qcResults).every(r => r.status === 'PASS');
  const failCount = Object.values(qcResults).filter(r => r.status === 'FAIL').length;

  return (
    <div className="mt-3 p-4 rounded-xl bg-zinc-900/80 border border-purple-500/30 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-purple-400" />
          <p className="text-sm font-medium text-purple-300">{title || 'Connector QC Test'}</p>
        </div>
        <span className="text-[10px] text-emerald-400 bg-emerald-600/10 px-2 py-0.5 rounded font-medium">
          Barcode Verified
        </span>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${allTested ? (allPass ? 'bg-emerald-500' : 'bg-red-500') : 'bg-purple-500'}`}
            style={{ width: `${(testedCount / totalCount) * 100}%` }}
          />
        </div>
        <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
          {testedCount} / {totalCount} tested
        </span>
      </div>

      {/* Connector list */}
      <div className="space-y-1">
        {connectors.map(c => {
          const result = qcResults[c.id] || { status: null, remarks: '' };
          return (
            <div key={c.id} className="rounded-lg bg-slate-800/50 p-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200">{c.name}</p>
                  {c.description && <p className="text-[10px] text-slate-500 mt-0.5">{c.description}</p>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => setQcResults(prev => ({ ...prev, [c.id]: { ...result, status: 'PASS' } }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      result.status === 'PASS'
                        ? 'bg-emerald-600/25 text-emerald-400 border-emerald-500/50'
                        : 'bg-slate-700/40 text-slate-500 border-slate-600/50 hover:text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    PASS
                  </button>
                  <button
                    onClick={() => setQcResults(prev => ({ ...prev, [c.id]: { ...result, status: 'FAIL' } }))}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      result.status === 'FAIL'
                        ? 'bg-red-600/25 text-red-400 border-red-500/50'
                        : 'bg-slate-700/40 text-slate-500 border-slate-600/50 hover:text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    FAIL
                  </button>
                </div>
              </div>
              {result.status === 'FAIL' && (
                <input
                  className="mt-2 w-full bg-zinc-900 border border-red-600/30 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500/60"
                  placeholder="Describe the issue..."
                  value={result.remarks}
                  onChange={e => setQcResults(prev => ({ ...prev, [c.id]: { ...result, remarks: e.target.value } }))}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Summary + Actions */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-700/50">
        <div className="text-xs">
          {!allTested ? (
            <span className="text-amber-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {totalCount - testedCount} connector{totalCount - testedCount > 1 ? 's' : ''} not tested
            </span>
          ) : allPass ? (
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> All connectors passed
            </span>
          ) : (
            <span className="text-red-400 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> {failCount} connector{failCount > 1 ? 's' : ''} failed
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-xs font-medium hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || !allTested}
            className={`px-4 py-2 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              !allTested
                ? 'bg-slate-700/50 text-slate-500 border-slate-600'
                : allPass
                  ? 'bg-emerald-600/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-600/30'
                  : 'bg-red-600/20 text-red-400 border-red-500/40 hover:bg-red-600/30'
            }`}
          >
            {submitting ? '...' : !allTested ? 'Test All Connectors' : allPass ? 'Submit QC Pass' : 'Submit QC Fail'}
          </button>
        </div>
      </div>
    </div>
  );
}
