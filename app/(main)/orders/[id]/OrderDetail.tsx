'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import { Check } from 'lucide-react';

// ── Assembly Unit Selector ─────────────────────────────────────────────────
function AssemblySelectModal({
  units,
  onSelect,
  onClose,
}: {
  units: UnitData[];
  onSelect: (psUnitId: string, psBarcode: string, bbBarcode: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedPS, setSelectedPS] = useState<{ id: string; barcode: string } | null>(null);
  const [selectedBB, setSelectedBB] = useState<{ id: string; barcode: string } | null>(null);

  // Only units physically at Assembly right now
  const eligible = units.filter((u) => {
    if (u.currentStage !== 'CONTROLLER_ASSEMBLY') return false;
    return u.currentStatus === 'IN_PROGRESS' || u.currentStatus === 'PENDING';
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? eligible.filter(
        (u) =>
          (u.powerstageBarcode ?? '').toLowerCase().includes(q) ||
          (u.brainboardBarcode ?? '').toLowerCase().includes(q)
      )
    : eligible;

  const canStart = selectedPS !== null && selectedBB !== null;

  function handleConfirm() {
    if (!canStart) return;
    // Pass PS unit ID + both barcodes so the pairing can be saved to DB
    onSelect(selectedPS!.id, selectedPS!.barcode, selectedBB!.barcode);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(4px)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div>
          <p className="text-sm font-semibold text-sky-400">Assembly — Select PS &amp; BB</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Select one Powerstage and one Brainboard to begin
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

      {/* Selection summary strip */}
      <div
        className="flex items-center gap-3 px-4 py-2.5 shrink-0"
        style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        {/* PS selection pill */}
        <div
          className="flex-1 flex items-center gap-2 rounded-lg px-3 py-1.5 min-w-0"
          style={{
            background: selectedPS ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${selectedPS ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          <span
            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
            style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}
          >PS</span>
          {selectedPS ? (
            <span className="font-mono text-xs text-indigo-300 truncate">{selectedPS.barcode}</span>
          ) : (
            <span className="text-xs text-zinc-600 italic">not selected</span>
          )}
          {selectedPS && (
            <button
              type="button"
              onClick={() => setSelectedPS(null)}
              className="ml-auto shrink-0 text-zinc-600 hover:text-zinc-400"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-zinc-700 shrink-0">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>

        {/* BB selection pill */}
        <div
          className="flex-1 flex items-center gap-2 rounded-lg px-3 py-1.5 min-w-0"
          style={{
            background: selectedBB ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${selectedBB ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.08)'}`,
          }}
        >
          <span
            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
            style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}
          >BB</span>
          {selectedBB ? (
            <span className="font-mono text-xs text-amber-300 truncate">{selectedBB.barcode}</span>
          ) : (
            <span className="text-xs text-zinc-600 italic">not selected</span>
          )}
          {selectedBB && (
            <button
              type="button"
              onClick={() => setSelectedBB(null)}
              className="ml-auto shrink-0 text-zinc-600 hover:text-zinc-400"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search barcode…"
            className="w-full rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            autoFocus
          />
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {eligible.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-zinc-500 text-sm">No units waiting at Assembly.</p>
            <p className="text-zinc-600 text-xs mt-1">Complete at least one Powerstage and one Brainboard first.</p>
          </div>
        ) : (
          <>
            {/* ── Powerstage ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}
                >
                  PS
                </div>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#818cf8' }}>
                  Powerstage
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {filtered.filter((u) => u.powerstageBarcode).length === 0 ? (
                  <p className="text-zinc-600 text-xs italic">No match</p>
                ) : (
                  filtered
                    .filter((u) => u.powerstageBarcode)
                    .map((u) => {
                      const isSelected = selectedPS?.id === u.id;
                      return (
                        <button
                          key={`ps-${u.id}`}
                          type="button"
                          onClick={() =>
                            setSelectedPS(
                              isSelected ? null : { id: u.id, barcode: u.powerstageBarcode! }
                            )
                          }
                          className="font-mono text-sm font-medium px-4 py-2 rounded-lg transition-all active:scale-95 flex items-center gap-1.5"
                          style={{
                            background: isSelected ? 'rgba(99,102,241,0.30)' : 'rgba(99,102,241,0.12)',
                            border: `1px solid ${isSelected ? 'rgba(99,102,241,0.7)' : 'rgba(99,102,241,0.3)'}`,
                            color: isSelected ? '#c7d2fe' : '#a5b4fc',
                            boxShadow: isSelected ? '0 0 0 2px rgba(99,102,241,0.25)' : 'none',
                          }}
                        >
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                          {u.powerstageBarcode}
                        </button>
                      );
                    })
                )}
              </div>
            </div>

            {/* ── Brainboard ── */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}
                >
                  BB
                </div>
                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#fbbf24' }}>
                  Brainboard
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {filtered.filter((u) => u.brainboardBarcode).length === 0 ? (
                  <p className="text-zinc-600 text-xs italic">No match</p>
                ) : (
                  filtered
                    .filter((u) => u.brainboardBarcode)
                    .map((u) => {
                      const isSelected = selectedBB?.id === u.id;
                      return (
                        <button
                          key={`bb-${u.id}`}
                          type="button"
                          onClick={() =>
                            setSelectedBB(
                              isSelected ? null : { id: u.id, barcode: u.brainboardBarcode! }
                            )
                          }
                          className="font-mono text-sm font-medium px-4 py-2 rounded-lg transition-all active:scale-95 flex items-center gap-1.5"
                          style={{
                            background: isSelected ? 'rgba(245,158,11,0.28)' : 'rgba(245,158,11,0.1)',
                            border: `1px solid ${isSelected ? 'rgba(245,158,11,0.7)' : 'rgba(245,158,11,0.3)'}`,
                            color: isSelected ? '#fde68a' : '#fcd34d',
                            boxShadow: isSelected ? '0 0 0 2px rgba(245,158,11,0.2)' : 'none',
                          }}
                        >
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                          {u.brainboardBarcode}
                        </button>
                      );
                    })
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer — Start button */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}
      >
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canStart}
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
          style={
            canStart
              ? { background: 'rgba(14,165,233,0.2)', border: '1px solid rgba(14,165,233,0.4)', color: '#38bdf8' }
              : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#3f3f46', cursor: 'not-allowed' }
          }
        >
          {canStart ? `Start Assembly — ${selectedPS!.barcode} + ${selectedBB!.barcode}` : 'Select both PS and BB to continue'}
        </button>
      </div>
    </div>
  );
}

export type UnitData = {
  id: string;
  serialNumber: string;
  currentStage: string;
  currentStatus: string;
  readyForDispatch?: boolean;        // true = unit has been dispatched (FA stage only)
  barcodeForStage?: string | null;   // the physical label barcode for this station
  derivedStatus?: string;            // COMPLETED / IN_PROGRESS / PENDING / BLOCKED / REWORK
  hasRework?: boolean;               // true = unit has been through rework at least once
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
  role: string;
  totalUnits: number;
};

/** Returns true if the given role can interact with (scan/tap) the given stage. */
function canRoleWorkStage(role: string, stageKey: string): boolean {
  if (role === 'PRODUCTION_EMPLOYEE') {
    // Production employees work every stage EXCEPT QC — that belongs to QC_USER
    return stageKey !== 'QC_AND_SOFTWARE';
  }
  if (role === 'QC_USER') {
    // QC users work only QC stage
    return stageKey === 'QC_AND_SOFTWARE';
  }
  return true;
}

const STATUS_STYLES: Record<string, { dot: string; text: string; label: string }> = {
  PENDING:          { dot: 'bg-zinc-600',    text: 'text-zinc-500',    label: 'Pending'      },
  IN_PROGRESS:      { dot: 'bg-amber-400',   text: 'text-amber-400',   label: 'In Progress'  },
  COMPLETED:        { dot: 'bg-green-400',   text: 'text-green-400',   label: 'Done'         },
  BLOCKED:          { dot: 'bg-red-500',     text: 'text-red-400',     label: 'Blocked'      },
  REWORK:           { dot: 'bg-orange-500',  text: 'text-orange-400',  label: 'Rework'       },
  WAITING_APPROVAL: { dot: 'bg-sky-400',     text: 'text-sky-400',     label: 'Approval'     },
  APPROVED:         { dot: 'bg-green-300',   text: 'text-green-300',   label: 'Approved'     },
  REJECTED_BACK:    { dot: 'bg-red-400',     text: 'text-red-300',     label: 'Rejected'     },
  DISPATCHED:       { dot: 'bg-violet-400',  text: 'text-violet-400',  label: 'Dispatched' },
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
/** Resolve the display status for a unit in production view */
function effectiveStatus(u: UnitData): string {
  return u.derivedStatus ?? u.currentStatus;
}

function MiniProgress({ units }: { units: UnitData[] }) {
  const total = units.length;
  if (total === 0) return null;
  const done = units.filter((u) => ['COMPLETED', 'APPROVED'].includes(effectiveStatus(u))).length;
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
  onUnitTap,
  isEmployee,
  isAccessible,
  accent = 'blue',
  scanLabel = 'Scan',
  showStatusLabel = false,
}: {
  stage: StageGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onScanStart: () => void;
  onUnitTap?: (unit: UnitData) => void;
  isEmployee: boolean;
  isAccessible: boolean;
  accent?: 'blue' | 'amber' | 'green' | 'red';
  scanLabel?: string;
  /** When true, each unit chip shows a small Submitted / Failed / In Progress label */
  showStatusLabel?: boolean;
}) {
  const total      = stage.units.length;
  const completed  = stage.units.filter((u) => ['COMPLETED', 'APPROVED'].includes(effectiveStatus(u))).length;
  const inProgress = stage.units.filter((u) => ['IN_PROGRESS', 'WAITING_APPROVAL'].includes(effectiveStatus(u))).length;
  const blocked    = stage.units.filter((u) => ['BLOCKED', 'REWORK', 'REJECTED_BACK'].includes(effectiveStatus(u))).length;

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

      {/* Expanded unit list — colour-coded serial numbers
          Grey = not started · Yellow = in progress · Green = passed · Red = failed
          Employee tapping a PENDING unit triggers scan-to-verify flow */}
      {isExpanded && total > 0 && (() => {
        const visibleUnits = isEmployee && isAccessible
          ? stage.units
          : !isEmployee ? stage.units : [];

        if (visibleUnits.length === 0) return null;

        // Colour mapping: grey=pending, amber=in-progress, green=passed, red=failed
        const colorMap: Record<string, { bg: string; text: string; border: string }> = {
          PENDING:          { bg: 'rgba(113,113,122,0.08)', text: 'text-zinc-500',  border: 'rgba(113,113,122,0.15)' },
          IN_PROGRESS:      { bg: 'rgba(251,191,36,0.10)', text: 'text-amber-400',  border: 'rgba(251,191,36,0.25)' },
          WAITING_APPROVAL: { bg: 'rgba(56,189,248,0.10)', text: 'text-sky-400',    border: 'rgba(56,189,248,0.25)' },
          COMPLETED:        { bg: 'rgba(34,197,94,0.10)',  text: 'text-green-400',  border: 'rgba(34,197,94,0.25)' },
          APPROVED:         { bg: 'rgba(34,197,94,0.10)',  text: 'text-green-400',  border: 'rgba(34,197,94,0.25)' },
          BLOCKED:          { bg: 'rgba(239,68,68,0.10)',  text: 'text-red-400',    border: 'rgba(239,68,68,0.25)' },
          REJECTED_BACK:    { bg: 'rgba(239,68,68,0.10)',  text: 'text-red-400',    border: 'rgba(239,68,68,0.25)' },
          REWORK:           { bg: 'rgba(249,115,22,0.10)', text: 'text-orange-400', border: 'rgba(249,115,22,0.25)' },
        };

        // In status-label mode (QC read-only for production employees),
        // hide units that haven't been touched yet — only show once QC has been submitted.
        const displayUnits = showStatusLabel
          ? visibleUnits.filter((u) => effectiveStatus(u) !== 'PENDING')
          : visibleUnits;

        if (displayUnits.length === 0 && showStatusLabel) {
          return (
            <div className="border-t px-3 py-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-zinc-600 text-xs text-center">No results submitted yet</p>
            </div>
          );
        }

        return (
          <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-px p-2">
              {displayUnits.map((u) => {
                const status = effectiveStatus(u);
                const c = colorMap[status] ?? colorMap.PENDING;
                const isPending = status === 'PENDING';
                const isPassed = status === 'COMPLETED' || status === 'APPROVED';

                // Employee tapping a PENDING unit → scan-to-verify before starting
                // Employee tapping active/done unit → go to unit page
                // Manager → always go to unit page
                const handleClick = (e: React.MouseEvent) => {
                  if (isEmployee && isPending && onUnitTap) {
                    e.preventDefault();
                    onUnitTap(u);
                  }
                };

                // Status label for QC read-only view (production employee watching QC progress)
                const statusLabelText =
                  showStatusLabel && (isPassed)
                    ? 'Submitted'
                    : showStatusLabel && (status === 'REJECTED_BACK' || status === 'BLOCKED')
                    ? 'Failed'
                    : showStatusLabel && (status === 'IN_PROGRESS' || status === 'WAITING_APPROVAL')
                    ? 'In Progress'
                    : null;

                return (
                  <a
                    key={u.id}
                    href={`/units/${u.id}`}
                    onClick={handleClick}
                    className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg font-mono text-xs transition-colors hover:brightness-125 ${c.text}`}
                    style={{ background: c.bg, border: `1px solid ${c.border}` }}
                  >
                    <span className="truncate">{u.barcodeForStage ?? u.serialNumber}</span>
                    {u.hasRework && (
                      <span className="text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-widest shrink-0"
                        style={{ color: '#f87171', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' }}>
                        RW
                      </span>
                    )}
                    {statusLabelText ? (
                      <span className="text-[9px] font-semibold shrink-0 uppercase tracking-wide opacity-80">
                        {statusLabelText}
                      </span>
                    ) : (
                      <>
                        {isPassed && <Check className="w-3 h-3 shrink-0" />}
                        {isEmployee && isPending && (
                          <svg className="w-3 h-3 shrink-0 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        )}
                      </>
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        );
      })()}    </div>
  );
}

export function OrderDetail({ orderId, stages, isEmployee, role, totalUnits }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scanning, setScanning] = useState<{ stageKey: string; stageLabel: string } | null>(null);
  const [verifyUnit, setVerifyUnit] = useState<{ unit: UnitData; stageKey: string } | null>(null);
  const [assemblySelect, setAssemblySelect] = useState(false);
  const [scanStatus, setScanStatus] = useState<{ msg: string; type: 'error' | 'info' } | null>(null);
  async function handleAssemblySelect(psUnitId: string, psBarcode: string, bbBarcode: string) {
    setAssemblySelect(false);
    setScanStatus({ msg: 'Recording assembly pairing…', type: 'info' });

    try {
      const asmUnits = asmStage?.units ?? [];
      const unit = asmUnits.find((u) => u.id === psUnitId);
      const status = unit?.derivedStatus ?? unit?.currentStatus;

      // Save the PS+BB pairing to the unit record and start it in one call
      await fetch(`/api/units/${psUnitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(status === 'PENDING' ? { status: 'IN_PROGRESS' } : {}),
          assemblyPowerstageBarcode: psBarcode,
          assemblyBrainboardBarcode: bbBarcode,
        }),
      });

      setScanStatus(null);
      router.push(`/units/${psUnitId}`);
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

  // Scan-to-verify: employee tapped a PENDING unit, must scan its barcode to confirm
  async function handleVerifyScan(scannedCode: string) {
    if (!verifyUnit) return;
    const { unit } = verifyUnit;
    setVerifyUnit(null);

    const expectedBarcode = unit.barcodeForStage ?? unit.serialNumber;
    // Match scanned code against expected barcode or serial number (case-insensitive)
    const match =
      scannedCode.toLowerCase() === expectedBarcode.toLowerCase() ||
      scannedCode.toLowerCase() === unit.serialNumber.toLowerCase();

    if (!match) {
      setScanStatus({
        msg: `Scanned "${scannedCode}" does not match expected "${expectedBarcode}". Pick the correct unit.`,
        type: 'error',
      });
      return;
    }

    // Matched — auto-start the unit and navigate
    setScanStatus({ msg: 'Starting manufacturing...', type: 'info' });
    try {
      await fetch(`/api/units/${unit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });
      setScanStatus(null);
      router.push(`/units/${unit.id}`);
    } catch {
      setScanStatus({ msg: 'Network error. Please try again.', type: 'error' });
    }
  }

  // Helper: called when employee taps a PENDING unit chip in a stage card
  function handleUnitTap(unit: UnitData, stageKey: string) {
    setVerifyUnit({ unit, stageKey });
  }

  const sequential = [
    asmStage && { stage: asmStage, accent: 'blue'  as const },
    qcStage  && { stage: qcStage,  accent: 'amber' as const },
    faStage  && { stage: faStage,  accent: 'green' as const },
  ].filter(Boolean) as { stage: StageGroup; accent: 'blue' | 'amber' | 'green' | 'red' }[];

  return (
    <>
      {/* Camera scanner modal — stage scan (any unit) */}
      {scanning && (
        <BarcodeScanner
          title={`Scan — ${scanning.stageLabel}`}
          hint="Point camera at unit barcode. Work starts automatically."
          onScan={handleScan}
          onClose={() => setScanning(null)}
        />
      )}

      {/* Camera scanner modal — verify specific unit before starting */}
      {verifyUnit && (
        <BarcodeScanner
          title="Scan to Verify"
          hint={`Scan barcode for ${verifyUnit.unit.barcodeForStage ?? verifyUnit.unit.serialNumber} to start manufacturing.`}
          onScan={handleVerifyScan}
          onClose={() => setVerifyUnit(null)}
        />
      )}

      {/* Assembly unit selector modal */}
      {assemblySelect && asmStage && (
        <AssemblySelectModal
          units={asmStage.units}
          onSelect={(psUnitId, psBarcode, bbBarcode) => handleAssemblySelect(psUnitId, psBarcode, bbBarcode)}
          onClose={() => setAssemblySelect(false)}
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
                  onUnitTap={isEmployee && canRoleWorkStage(role, psStage.key) ? (u) => handleUnitTap(u, psStage.key) : undefined}
                  isEmployee={isEmployee && canRoleWorkStage(role, psStage.key)}
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
                  onUnitTap={isEmployee && canRoleWorkStage(role, bbStage.key) ? (u) => handleUnitTap(u, bbStage.key) : undefined}
                  isEmployee={isEmployee && canRoleWorkStage(role, bbStage.key)}
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
              {sequential.map(({ stage, accent }) => {
                const roleCanWork = canRoleWorkStage(role, stage.key);
                // Production employee watching QC: show status labels on chips, expand by default
                const isQcReadOnly = role === 'PRODUCTION_EMPLOYEE' && stage.key === 'QC_AND_SOFTWARE';
                return (
                  <StageCard
                    key={stage.key}
                    stage={stage}
                    isExpanded={isQcReadOnly ? true : expanded === stage.key}
                    onToggle={() => toggle(stage.key)}
                    onScanStart={
                      stage.key === 'CONTROLLER_ASSEMBLY'
                        ? () => setAssemblySelect(true)
                        : () => setScanning({ stageKey: stage.key, stageLabel: stage.label })
                    }
                    onUnitTap={isEmployee && roleCanWork ? (u) => handleUnitTap(u, stage.key) : undefined}
                    isEmployee={isEmployee && roleCanWork}
                    isAccessible={isStageAccessible(stage.key, allUnits)}
                    accent={accent}
                    scanLabel={stage.key === 'CONTROLLER_ASSEMBLY' ? 'Select' : 'Scan'}
                    showStatusLabel={isQcReadOnly}
                  />
                );
              })}
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
