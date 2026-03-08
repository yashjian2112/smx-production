'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BarcodeScanner } from '@/components/BarcodeScanner';

export type UnitData = {
  id: string;
  serialNumber: string;
  currentStage: string;
  currentStatus: string;
  barcodeForStage?: string | null;   // the physical label barcode for this station
  derivedStatus?: string;            // COMPLETED / IN_PROGRESS / PENDING / BLOCKED / REWORK
};

export type StageGroup = {
  key: string;
  label: string;
  units: UnitData[];
};

type Props = {
  stages: StageGroup[];
  isEmployee: boolean;
  totalUnits: number;
};

const STATUS_STYLES: Record<string, { dot: string; text: string; label: string }> = {
  PENDING:          { dot: 'bg-zinc-600',   text: 'text-zinc-500',   label: 'Pending'    },
  IN_PROGRESS:      { dot: 'bg-amber-400',  text: 'text-amber-400',  label: 'In Progress'},
  COMPLETED:        { dot: 'bg-green-400',  text: 'text-green-400',  label: 'Done'       },
  BLOCKED:          { dot: 'bg-red-500',    text: 'text-red-400',    label: 'Blocked'    },
  REWORK:           { dot: 'bg-orange-500', text: 'text-orange-400', label: 'Rework'     },
  WAITING_APPROVAL: { dot: 'bg-sky-400',    text: 'text-sky-400',    label: 'Approval'   },
  APPROVED:         { dot: 'bg-green-300',  text: 'text-green-300',  label: 'Approved'   },
  REJECTED_BACK:    { dot: 'bg-red-400',    text: 'text-red-300',    label: 'Rejected'   },
};

// Stages employees are allowed to scan and work on
const EMPLOYEE_ACCESSIBLE_STAGES = new Set([
  'POWERSTAGE_MANUFACTURING',
  'BRAINBOARD_MANUFACTURING',
]);

function MiniProgress({ units }: { units: UnitData[] }) {
  const total = units.length;
  if (total === 0) return null;
  const done = units.filter((u) => (u.derivedStatus ?? u.currentStatus) === 'COMPLETED').length;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="mt-2">
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: pct === 100 ? '#22c55e' : '#38bdf8', transition: 'width 0.4s' }}
        />
      </div>
      <p className="text-[10px] text-zinc-600 mt-1">{done}/{total} complete</p>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-zinc-600">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function StageCard({
  stage,
  isExpanded,
  onToggle,
  onScanStart,
  isEmployee,
  isAccessible,
  accent = 'blue',
}: {
  stage: StageGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onScanStart: () => void;
  isEmployee: boolean;
  isAccessible: boolean;
  accent?: 'blue' | 'amber' | 'green' | 'red';
}) {
  const total      = stage.units.length;
  const completed  = stage.units.filter((u) => (u.derivedStatus ?? u.currentStatus) === 'COMPLETED').length;
  const inProgress = stage.units.filter((u) => ['IN_PROGRESS', 'WAITING_APPROVAL', 'APPROVED'].includes(u.derivedStatus ?? u.currentStatus)).length;
  const blocked    = stage.units.filter((u) => ['BLOCKED', 'REWORK', 'REJECTED_BACK'].includes(u.derivedStatus ?? u.currentStatus)).length;

  const isLocked = isEmployee && !isAccessible;

  const colors = {
    blue:  { border: 'rgba(56,189,248,0.2)',  title: 'text-sky-400',   scanBg: 'rgba(14,165,233,0.15)', scanBorder: 'rgba(14,165,233,0.3)',  scanText: '#38bdf8' },
    amber: { border: 'rgba(251,191,36,0.2)',  title: 'text-amber-400', scanBg: 'rgba(251,191,36,0.12)', scanBorder: 'rgba(251,191,36,0.3)',  scanText: '#fbbf24' },
    green: { border: 'rgba(34,197,94,0.2)',   title: 'text-green-400', scanBg: 'rgba(34,197,94,0.12)',  scanBorder: 'rgba(34,197,94,0.3)',   scanText: '#4ade80' },
    red:   { border: 'rgba(239,68,68,0.2)',   title: 'text-red-400',   scanBg: 'rgba(239,68,68,0.12)', scanBorder: 'rgba(239,68,68,0.3)',   scanText: '#f87171' },
  }[accent];

  const lockedBorder = 'rgba(255,255,255,0.06)';

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border: `1px solid ${isLocked ? lockedBorder : colors.border}`,
        background: isLocked ? 'rgba(255,255,255,0.01)' : 'rgba(255,255,255,0.02)',
        opacity: isLocked ? 0.65 : 1,
      }}
    >
      {/* Header row */}
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={!isLocked ? onToggle : undefined}
          className={`flex-1 flex items-center justify-between p-3 text-left min-w-0 ${
            !isLocked ? 'hover:bg-white/5 transition-colors cursor-pointer' : 'cursor-default'
          }`}
        >
          <div className="flex-1 min-w-0 pr-2">
            <p className={`text-sm font-semibold ${isLocked ? 'text-zinc-500' : colors.title}`}>{stage.label}</p>
            {total > 0 ? (
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {completed}/{total} done
                {inProgress > 0 && ` · ${inProgress} active`}
                {blocked > 0 && <span className="text-red-400"> · {blocked} blocked</span>}
              </p>
            ) : (
              <p className="text-[11px] text-zinc-600 mt-0.5">No units yet</p>
            )}
            {!isLocked && <MiniProgress units={stage.units} />}
          </div>
          {isLocked ? (
            <LockIcon />
          ) : (
            <svg
              className={`text-zinc-600 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          )}
        </button>

        {/* Scan button — employees only on accessible stages */}
        {isEmployee && isAccessible && total > 0 && (
          <button
            type="button"
            onClick={onScanStart}
            className="flex flex-col items-center justify-center px-3 gap-1 border-l text-xs font-medium transition-colors hover:brightness-125"
            style={{
              borderColor: colors.border,
              background: colors.scanBg,
              color: colors.scanText,
              minWidth: 56,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="7" y1="9" x2="7" y2="15" />
              <line x1="10" y1="9" x2="10" y2="15" />
              <line x1="13" y1="9" x2="13" y2="15" />
              <line x1="16" y1="9" x2="16" y2="15" />
            </svg>
            <span className="text-[10px]">Scan</span>
          </button>
        )}
      </div>

      {/* Expanded unit list — managers only */}
      {isExpanded && !isEmployee && total > 0 && (
        <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <ul>
            {stage.units.map((u) => {
              const status = u.derivedStatus ?? u.currentStatus;
              const s = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING;
              return (
                <li key={u.id} className="border-b last:border-b-0" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  <a
                    href={`/units/${u.id}`}
                    className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                    <span className="font-mono text-sky-400 text-sm flex-1 truncate">{u.serialNumber}</span>
                    {u.barcodeForStage && (
                      <span className="font-mono text-[10px] text-zinc-600 shrink-0 hidden sm:block">{u.barcodeForStage}</span>
                    )}
                    <span className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 ${s.text}`}>
                      {s.label}
                    </span>
                    <svg className="text-zinc-700 shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function OrderDetail({ stages, isEmployee, totalUnits }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scanning, setScanning] = useState<{ stageKey: string; stageLabel: string } | null>(null);
  const [scanStatus, setScanStatus] = useState<{ msg: string; type: 'error' | 'info' } | null>(null);

  const toggle = useCallback((key: string) => setExpanded((p) => (p === key ? null : key)), []);

  const psStage  = stages.find((s) => s.key === 'POWERSTAGE_MANUFACTURING');
  const bbStage  = stages.find((s) => s.key === 'BRAINBOARD_MANUFACTURING');
  const asmStage = stages.find((s) => s.key === 'CONTROLLER_ASSEMBLY');
  const qcStage  = stages.find((s) => s.key === 'QC_AND_SOFTWARE');
  const faStage  = stages.find((s) => s.key === 'FINAL_ASSEMBLY');
  const rwStage  = stages.find((s) => s.key === 'REWORK');

  async function handleScan(code: string) {
    setScanning(null);
    setScanStatus({ msg: 'Looking up unit…', type: 'info' });

    try {
      let res = await fetch(`/api/units/by-serial/${encodeURIComponent(code)}`);
      let data = await res.json().catch(() => ({}));
      if (!res.ok) {
        res = await fetch(`/api/units/by-barcode/${encodeURIComponent(code)}`);
        data = await res.json().catch(() => ({}));
      }

      if (!res.ok || !data?.id) {
        // Use the API's error message (includes smart component barcode detection)
        const apiMsg = data?.error || `No unit found for: ${code}`;
        setScanStatus({ msg: apiMsg, type: 'error' });
        return;
      }

      const unitId: string = data.id;

      // Auto-start: mark unit IN_PROGRESS if still PENDING
      if (data.currentStatus === 'PENDING') {
        await fetch(`/api/units/${unitId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'IN_PROGRESS' }),
        });
      }

      setScanStatus(null);
      router.push(`/units/${unitId}`);
    } catch {
      setScanStatus({ msg: 'Network error. Please try again.', type: 'error' });
    }
  }

  const sequential = [
    asmStage && { stage: asmStage, accent: 'blue'  as const },
    qcStage  && { stage: qcStage,  accent: 'amber' as const },
    faStage  && { stage: faStage,  accent: 'green' as const },
  ].filter(Boolean) as { stage: StageGroup; accent: 'blue' | 'amber' | 'green' | 'red' }[];

  return (
    <>
      {/* Camera scanner modal */}
      {scanning && (
        <BarcodeScanner
          title={`Scan — ${scanning.stageLabel}`}
          hint="Point camera at unit barcode. Work starts automatically."
          onScan={handleScan}
          onClose={() => setScanning(null)}
        />
      )}

      <div className="space-y-4">
        {/* Scan status feedback */}
        {scanStatus && (
          <div
            className="rounded-xl p-3 text-sm text-center"
            style={
              scanStatus.type === 'error'
                ? { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }
                : { background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }
            }
          >
            {scanStatus.msg}
            {scanStatus.type === 'error' && (
              <button type="button" onClick={() => setScanStatus(null)} className="ml-3 underline opacity-70">
                Dismiss
              </button>
            )}
          </div>
        )}

        {/* ── Manufacturing Phase (Parallel PS + BB) ── */}
        {(psStage || bbStage) && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Manufacturing</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <span className="text-[11px] text-zinc-600">Parallel</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {psStage && (
                <StageCard
                  stage={psStage}
                  isExpanded={expanded === psStage.key}
                  onToggle={() => toggle(psStage.key)}
                  onScanStart={() => setScanning({ stageKey: psStage.key, stageLabel: psStage.label })}
                  isEmployee={isEmployee}
                  isAccessible={EMPLOYEE_ACCESSIBLE_STAGES.has(psStage.key)}
                  accent="blue"
                />
              )}
              {bbStage && (
                <StageCard
                  stage={bbStage}
                  isExpanded={expanded === bbStage.key}
                  onToggle={() => toggle(bbStage.key)}
                  onScanStart={() => setScanning({ stageKey: bbStage.key, stageLabel: bbStage.label })}
                  isEmployee={isEmployee}
                  isAccessible={EMPLOYEE_ACCESSIBLE_STAGES.has(bbStage.key)}
                  accent="blue"
                />
              )}
            </div>
          </div>
        )}

        {/* ── Sequential Production Flow ── */}
        {sequential.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Production Flow</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>
            <div className="space-y-2">
              {sequential.map(({ stage, accent }) => (
                <StageCard
                  key={stage.key}
                  stage={stage}
                  isExpanded={expanded === stage.key}
                  onToggle={() => toggle(stage.key)}
                  onScanStart={() => setScanning({ stageKey: stage.key, stageLabel: stage.label })}
                  isEmployee={isEmployee}
                  isAccessible={EMPLOYEE_ACCESSIBLE_STAGES.has(stage.key)}
                  accent={accent}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Rework (only if units are in rework) ── */}
        {rwStage && rwStage.units.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-red-500">Rework</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(239,68,68,0.15)' }} />
            </div>
            <StageCard
              stage={rwStage}
              isExpanded={expanded === rwStage.key}
              onToggle={() => toggle(rwStage.key)}
              onScanStart={() => setScanning({ stageKey: rwStage.key, stageLabel: rwStage.label })}
              isEmployee={isEmployee}
              isAccessible={false}
              accent="red"
            />
          </div>
        )}

        {totalUnits === 0 && (
          <div className="card p-6 text-center">
            <p className="text-zinc-500 text-sm">No units in this order yet.</p>
          </div>
        )}
      </div>
    </>
  );
}
