'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BarcodeScanner } from '@/components/BarcodeScanner';

// ── Assembly Unit Selector ─────────────────────────────────────────────────
function AssemblySelectModal({
  units,
  onSelect,
  onClose,
}: {
  units: UnitData[];
  onSelect: (unitId: string) => void;
  onClose: () => void;
}) {
  // Only show units that are ACTUALLY at Assembly stage right now and can be worked on
  const eligible = units.filter((u) => {
    if (u.currentStage !== 'CONTROLLER_ASSEMBLY') return false; // not here yet, or already past
    return u.currentStatus === 'IN_PROGRESS' || u.currentStatus === 'PENDING';
  });

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div>
          <p className="text-sm font-semibold text-sky-400">Select Unit — Assembly</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Identify your unit by its Powerstage or Brainboard barcode
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Unit list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {eligible.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">No units waiting at Assembly.</p>
            <p className="text-zinc-600 text-xs mt-1">Check that at least one Powerstage and one Brainboard are complete.</p>
          </div>
        ) : (
          eligible.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onSelect(u.id)}
              className="w-full text-left rounded-xl p-4 transition-all hover:brightness-110 active:scale-[0.98]"
              style={{
                background: 'rgba(14,165,233,0.06)',
                border: '1px solid rgba(14,165,233,0.2)',
              }}
            >
              {/* Serial number */}
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-sky-400 font-bold text-base">{u.serialNumber}</span>
                <div
                  className="flex items-center gap-1.5 text-[10px] font-semibold uppercase px-2 py-1 rounded-full"
                  style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8' }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                  Select
                </div>
              </div>

              {/* Barcode chips */}
              <div className="flex flex-col gap-2">
                {/* Powerstage barcode */}
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div
                    className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}
                  >
                    PS
                  </div>
                  {u.powerstageBarcode ? (
                    <span className="font-mono text-xs text-zinc-300">{u.powerstageBarcode}</span>
                  ) : (
                    <span className="text-xs text-zinc-600 italic">Not assigned</span>
                  )}
                </div>

                {/* Brainboard barcode */}
                <div
                  className="flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div
                    className="shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}
                  >
                    BB
                  </div>
                  {u.brainboardBarcode ? (
                    <span className="font-mono text-xs text-zinc-300">{u.brainboardBarcode}</span>
                  ) : (
                    <span className="text-xs text-zinc-600 italic">Not assigned</span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export type UnitData = {
  id: string;
  serialNumber: string;
  currentStage: string;
  currentStatus: string;
  barcodeForStage?: string | null;   // the physical label barcode for this station
  derivedStatus?: string;            // COMPLETED / IN_PROGRESS / PENDING / BLOCKED / REWORK
  powerstageBarcode?: string | null; // for Assembly multi-barcode select
  brainboardBarcode?: string | null; // for Assembly multi-barcode select
};

export type StageGroup = {
  key: string;
  label: string;
  units: UnitData[];
};

type Props = {
  orderId: string;
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

// Pipeline order — used to derive dynamic stage accessibility
const STAGE_PIPELINE = [
  'POWERSTAGE_MANUFACTURING',
  'BRAINBOARD_MANUFACTURING',
  'CONTROLLER_ASSEMBLY',
  'QC_AND_SOFTWARE',
  'FINAL_ASSEMBLY',
];

/**
 * A stage is accessible to employees when:
 *  - PS / BB: always accessible (they're the entry-point parallel stages)
 *  - Assembly and beyond: unlocked once at least 1 unit has reached that stage
 *    (meaning it has completed all prior stages)
 */
function isStageAccessible(stageKey: string, units: UnitData[]): boolean {
  if (stageKey === 'POWERSTAGE_MANUFACTURING' || stageKey === 'BRAINBOARD_MANUFACTURING') return true;
  const stageIdx = STAGE_PIPELINE.indexOf(stageKey);
  if (stageIdx < 0) return false;
  return units.some((u) => STAGE_PIPELINE.indexOf(u.currentStage) >= stageIdx);
}
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
  scanLabel = 'Scan',
}: {
  stage: StageGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onScanStart: () => void;
  isEmployee: boolean;
  isAccessible: boolean;
  accent?: 'blue' | 'amber' | 'green' | 'red';
  scanLabel?: string;
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

        {/* Scan / Select button — employees only on accessible stages */}
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
            {scanLabel === 'Select' ? (
              /* List / select icon for Assembly */
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <circle cx="3" cy="6" r="1" fill="currentColor" />
                <circle cx="3" cy="12" r="1" fill="currentColor" />
                <circle cx="3" cy="18" r="1" fill="currentColor" />
              </svg>
            ) : (
              /* Barcode scan icon for other stages */
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
            )}
            <span className="text-[10px]">{scanLabel}</span>
          </button>
        )}
      </div>

      {/* Expanded unit list — managers/admins see full row with print button */}
      {isExpanded && !isEmployee && total > 0 && (
        <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <ul>
            {stage.units.filter((u) => (u.derivedStatus ?? u.currentStatus) !== 'PENDING').map((u) => {
              const status = u.derivedStatus ?? u.currentStatus;
              const s = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING;
              return (
                <li key={u.id} className="flex items-center border-b last:border-b-0" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                  {/* Unit detail link */}
                  <a
                    href={`/units/${u.id}`}
                    className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors flex-1 min-w-0"
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                    <span className="font-mono text-sky-400 text-sm">{u.serialNumber}</span>
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
                  {/* Print unit label — admin only */}
                  <a
                    href={`/print/unit/${u.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Print unit barcode labels"
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 mr-2 rounded text-[10px] font-medium transition-colors"
                    style={{ background: 'rgba(14,165,233,0.08)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.15)' }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    Print
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Expanded unit list — employees see serial + status on their accessible stages.
          Only shows assigned (IN_PROGRESS / COMPLETED) units — PENDING = unassigned, hidden. */}
      {isExpanded && isEmployee && isAccessible && total > 0 && (() => {
        const assignedUnits = stage.units.filter(
          (u) => (u.derivedStatus ?? u.currentStatus) !== 'PENDING',
        );
        return (
          <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            {assignedUnits.length === 0 ? (
              <p className="px-3 py-3 text-xs text-zinc-600">No units assigned yet — scan a barcode to start.</p>
            ) : (
              <ul>
                {assignedUnits.map((u) => {
                  const status = u.derivedStatus ?? u.currentStatus;
                  const s = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING;
                  const isCompleted = status === 'COMPLETED';
                  return (
                    <li key={u.id} className="border-b last:border-b-0" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                      {/* All assigned units are tappable:
                          IN_PROGRESS → open work page
                          COMPLETED   → open unit page to view history */}
                      <a href={`/units/${u.id}`} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 transition-colors">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${s.dot}`} />
                        <span className="font-mono text-sky-400 text-sm flex-1 truncate">{u.serialNumber}</span>
                        <span className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 ${s.text}`}>
                          {isCompleted ? 'Done ✓' : s.label}
                        </span>
                        <svg className="text-zinc-600 shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })()}    </div>
  );
}

export function OrderDetail({ orderId, stages, isEmployee, totalUnits }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scanning, setScanning] = useState<{ stageKey: string; stageLabel: string } | null>(null);
  const [assemblySelect, setAssemblySelect] = useState(false);
  const [scanStatus, setScanStatus] = useState<{ msg: string; type: 'error' | 'info' } | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  async function handleGenerateBarcodes() {
    setGenLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/generate-barcodes`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setScanStatus({ msg: `Barcodes generated for ${data.generated} unit(s). Refreshing…`, type: 'info' });
        router.refresh();
      } else {
        setScanStatus({ msg: data.error || 'Failed to generate barcodes', type: 'error' });
      }
    } catch {
      setScanStatus({ msg: 'Network error. Please try again.', type: 'error' });
    } finally {
      setGenLoading(false);
    }
  }

  async function handleAssemblySelect(unitId: string) {
    setAssemblySelect(false);
    setScanStatus({ msg: 'Opening unit…', type: 'info' });

    try {
      // Find the unit data to check its status
      const asmUnits = asmStage?.units ?? [];
      const unit = asmUnits.find((u) => u.id === unitId);
      const status = unit?.derivedStatus ?? unit?.currentStatus;

      // Auto-start: mark PENDING unit as IN_PROGRESS
      if (status === 'PENDING') {
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

  const toggle = useCallback((key: string) => setExpanded((p) => (p === key ? null : key)), []);

  const psStage  = stages.find((s) => s.key === 'POWERSTAGE_MANUFACTURING');
  const bbStage  = stages.find((s) => s.key === 'BRAINBOARD_MANUFACTURING');
  const asmStage = stages.find((s) => s.key === 'CONTROLLER_ASSEMBLY');
  const qcStage  = stages.find((s) => s.key === 'QC_AND_SOFTWARE');
  const faStage  = stages.find((s) => s.key === 'FINAL_ASSEMBLY');
  const rwStage  = stages.find((s) => s.key === 'REWORK');

  // All units are the same set across any non-rework stage group
  const allUnits = (psStage ?? bbStage ?? asmStage ?? qcStage ?? faStage)?.units ?? [];

  async function handleScan(code: string) {
    const currentStage = scanning; // capture before clearing
    setScanning(null);

    // Component barcodes (COMP-…) are for board identification during Assembly only
    if (code.startsWith('COMP-')) {
      setScanStatus({ msg: 'Component barcodes are not valid here. Scan the unit serial or stage barcode (PS / BB / QC / FA).', type: 'error' });
      return;
    }

    setScanStatus({ msg: 'Looking up unit…', type: 'info' });

    try {
      // First try serial number lookup
      let res = await fetch(`/api/units/by-serial/${encodeURIComponent(code)}`);
      let data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Try stage-specific barcode lookup (passes stageKey so API validates correct barcode type)
        const stageParam = currentStage?.stageKey
          ? `?stage=${encodeURIComponent(currentStage.stageKey)}`
          : '';
        res = await fetch(`/api/units/by-barcode/${encodeURIComponent(code)}${stageParam}`);
        data = await res.json().catch(() => ({}));
      }

      if (!res.ok || !data?.id) {
        const apiMsg = data?.error || `No unit found for: ${code}`;
        setScanStatus({ msg: apiMsg, type: 'error' });
        return;
      }

      // Guard: block re-scanning units already completed or past this stage
      const stageKey = currentStage?.stageKey;
      if (stageKey) {
        const pipeline = [
          'POWERSTAGE_MANUFACTURING',
          'BRAINBOARD_MANUFACTURING',
          'CONTROLLER_ASSEMBLY',
          'QC_AND_SOFTWARE',
          'FINAL_ASSEMBLY',
        ];
        const unitIdx = pipeline.indexOf(data.currentStage);
        const scanIdx = pipeline.indexOf(stageKey);
        const alreadyDone =
          unitIdx > scanIdx ||
          (unitIdx === scanIdx && ['COMPLETED', 'WAITING_APPROVAL', 'APPROVED'].includes(data.currentStatus));
        if (alreadyDone) {
          setScanStatus({
            msg: `${data.serialNumber} has already completed ${currentStage?.stageLabel ?? stageKey}. Cannot re-scan.`,
            type: 'error',
          });
          return;
        }
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

      {/* Assembly unit selector modal */}
      {assemblySelect && asmStage && (
        <AssemblySelectModal
          units={asmStage.units}
          onSelect={handleAssemblySelect}
          onClose={() => setAssemblySelect(false)}
        />
      )}

      <div className="space-y-4">
        {/* Generate Barcodes — admin/manager only */}
        {!isEmployee && (
          <button
            type="button"
            onClick={handleGenerateBarcodes}
            disabled={genLoading}
            className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
            style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" /><path d="M14 14h.01M18 14h.01M14 18h.01M18 18h.01M21 14v4M14 21h4" />
            </svg>
            {genLoading ? 'Generating…' : 'Generate Barcodes for All Units'}
          </button>
        )}

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
                  isAccessible={isStageAccessible(psStage.key, allUnits)}
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
                  isAccessible={isStageAccessible(bbStage.key, allUnits)}
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
                  onScanStart={
                    stage.key === 'CONTROLLER_ASSEMBLY'
                      ? () => setAssemblySelect(true)
                      : () => setScanning({ stageKey: stage.key, stageLabel: stage.label })
                  }
                  isEmployee={isEmployee}
                  isAccessible={isStageAccessible(stage.key, allUnits)}
                  accent={accent}
                  scanLabel={stage.key === 'CONTROLLER_ASSEMBLY' ? 'Select' : 'Scan'}
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
