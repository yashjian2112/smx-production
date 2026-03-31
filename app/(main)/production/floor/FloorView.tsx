'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

/* ── Types ── */
type StageType =
  | 'POWERSTAGE_MANUFACTURING'
  | 'BRAINBOARD_MANUFACTURING'
  | 'CONTROLLER_ASSEMBLY'
  | 'QC_AND_SOFTWARE'
  | 'REWORK'
  | 'FINAL_ASSEMBLY';

type UnitStatus = 'PENDING' | 'IN_PROGRESS' | 'WAITING_APPROVAL' | 'REJECTED_BACK' | 'BLOCKED';

type FloorUnit = {
  id: string;
  serialNumber: string;
  currentStage: StageType;
  currentStatus: UnitStatus;
  updatedAt: string;
  order: { orderNumber: string; id: string };
  product: { name: string; code: string };
  assignments: { stage: string; user: { id: string; name: string } }[];
};

type FloorData = {
  units: FloorUnit[];
  stageCounts: Record<StageType, number>;
  totalActive: number;
  totalWorkers: number;
  refreshedAt: string;
};

/* ── Constants ── */
const STAGES: { key: StageType; label: string; short: string }[] = [
  { key: 'POWERSTAGE_MANUFACTURING', label: 'Powerstage',          short: 'PS'  },
  { key: 'BRAINBOARD_MANUFACTURING', label: 'Brainboard',          short: 'BB'  },
  { key: 'CONTROLLER_ASSEMBLY',      label: 'Controller Assembly', short: 'CA'  },
  { key: 'QC_AND_SOFTWARE',          label: 'QC & Software',       short: 'QC'  },
  { key: 'REWORK',                   label: 'Rework',              short: 'RW'  },
  { key: 'FINAL_ASSEMBLY',           label: 'Final Assembly',       short: 'FA'  },
];

const STATUS_CONFIG: Record<UnitStatus, { label: string; dot: string; row: string }> = {
  PENDING:          { label: 'Pending',          dot: 'bg-slate-500',   row: '' },
  IN_PROGRESS:      { label: 'In Progress',      dot: 'bg-sky-400',     row: 'border-l-2 border-sky-500/40' },
  WAITING_APPROVAL: { label: 'Waiting Approval', dot: 'bg-amber-400',   row: 'border-l-2 border-amber-500/40' },
  REJECTED_BACK:    { label: 'Rejected Back',    dot: 'bg-red-400',     row: 'border-l-2 border-red-500/40' },
  BLOCKED:          { label: 'QC Fail',           dot: 'bg-orange-400',  row: 'border-l-2 border-orange-500/40' },
};

const STAGE_COLORS: Record<StageType, string> = {
  POWERSTAGE_MANUFACTURING: 'from-violet-500/20 to-violet-500/5 border-violet-500/30',
  BRAINBOARD_MANUFACTURING: 'from-blue-500/20 to-blue-500/5 border-blue-500/30',
  CONTROLLER_ASSEMBLY:      'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30',
  QC_AND_SOFTWARE:          'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30',
  REWORK:                   'from-red-500/20 to-red-500/5 border-red-500/30',
  FINAL_ASSEMBLY:           'from-amber-500/20 to-amber-500/5 border-amber-500/30',
};

const STAGE_ICON_COLOR: Record<StageType, string> = {
  POWERSTAGE_MANUFACTURING: 'text-violet-400',
  BRAINBOARD_MANUFACTURING: 'text-blue-400',
  CONTROLLER_ASSEMBLY:      'text-cyan-400',
  QC_AND_SOFTWARE:          'text-emerald-400',
  REWORK:                   'text-red-400',
  FINAL_ASSEMBLY:           'text-amber-400',
};

/* ── Helpers ── */
function elapsed(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

function elapsedMins(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function elapsedColor(mins: number): string {
  if (mins > 2880) return 'text-red-400';   // > 2 days
  if (mins > 480)  return 'text-amber-400'; // > 8 hrs
  return 'text-slate-400';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/* ── Unit Row ── */
function UnitRow({ unit }: { unit: FloorUnit }) {
  const s  = STATUS_CONFIG[unit.currentStatus];
  const em = elapsedMins(unit.updatedAt);
  const assignedUser = unit.assignments.find((a) => a.stage === unit.currentStage)?.user;

  return (
    <Link
      href={`/units/${unit.id}`}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors ${s.row}`}
    >
      {/* Status dot */}
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />

      {/* Serial */}
      <span className="font-mono text-xs text-sky-400 w-24 truncate flex-shrink-0">
        {unit.serialNumber}
      </span>

      {/* Product + Order */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white truncate">{unit.product.name}</p>
        <p className="text-[10px] text-slate-500 truncate">{unit.order.orderNumber}</p>
      </div>

      {/* Employee */}
      <div className="text-right flex-shrink-0">
        {assignedUser ? (
          <p className="text-xs text-slate-300 truncate max-w-[80px]">{assignedUser.name.split(' ')[0]}</p>
        ) : (
          <p className="text-xs text-slate-600">—</p>
        )}
        <p className={`text-[10px] ${elapsedColor(em)}`}>{elapsed(unit.updatedAt)}</p>
      </div>
    </Link>
  );
}

/* ── Stage Column ── */
function StageColumn({ stage, units }: { stage: typeof STAGES[0]; units: FloorUnit[] }) {
  const colors    = STAGE_COLORS[stage.key];
  const iconColor = STAGE_ICON_COLOR[stage.key];
  const waiting   = units.filter((u) => u.currentStatus === 'WAITING_APPROVAL').length;
  const inprog    = units.filter((u) => u.currentStatus === 'IN_PROGRESS').length;
  const rejected  = units.filter((u) => u.currentStatus === 'REJECTED_BACK').length;

  return (
    <div className={`rounded-xl border bg-gradient-to-b ${colors} flex flex-col`}
      style={{ minHeight: '200px' }}>
      {/* Stage header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-bold ${iconColor}`}>{stage.short}</span>
            <span className="text-sm font-semibold text-white">{stage.label}</span>
          </div>
          <span className={`text-lg font-bold ${iconColor}`}>{units.length}</span>
        </div>

        {/* Mini stats */}
        {units.length > 0 && (
          <div className="flex items-center gap-3 mt-2">
            {inprog > 0 && (
              <span className="text-[10px] text-sky-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
                {inprog} active
              </span>
            )}
            {waiting > 0 && (
              <span className="text-[10px] text-amber-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                {waiting} waiting
              </span>
            )}
            {rejected > 0 && (
              <span className="text-[10px] text-red-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                {rejected} rejected
              </span>
            )}
          </div>
        )}
      </div>

      {/* Unit list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5" style={{ maxHeight: '420px' }}>
        {units.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-slate-600">No active units</p>
          </div>
        ) : (
          units.map((u) => <UnitRow key={u.id} unit={u} />)
        )}
      </div>
    </div>
  );
}

/* ── Summary Cards ── */
function SummaryCard({ label, value, sub, color }: {
  label: string; value: number | string; sub?: string; color: string;
}) {
  return (
    <div className="rounded-xl border p-4" style={{ background: 'rgba(15,23,42,0.6)', borderColor: 'rgba(148,163,184,0.1)' }}>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-1">{sub}</p>}
    </div>
  );
}

/* ── Main Component ── */
export function FloorView() {
  const [data, setData]       = useState<FloorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [lastUpdate, setLastUpdate] = useState('');
  const [filterStage, setFilterStage] = useState<StageType | 'ALL'>('ALL');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/production/floor');
      if (!res.ok) throw new Error('Failed to load floor data');
      const json: FloorData = await res.json();
      setData(json);
      setLastUpdate(fmt(json.refreshedAt));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error loading data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const filteredUnits = (stage: StageType) =>
    (data?.units ?? []).filter((u) => u.currentStage === stage);

  const displayedStages = filterStage === 'ALL'
    ? STAGES
    : STAGES.filter((s) => s.key === filterStage);

  const reworkCount   = data?.stageCounts['REWORK'] ?? 0;
  const waitingTotal  = (data?.units ?? []).filter((u) => u.currentStatus === 'WAITING_APPROVAL').length;
  const blockedTotal  = (data?.units ?? []).filter((u) => u.currentStatus === 'BLOCKED').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Production Floor</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Live view · auto-refreshes every 30s
            {lastUpdate && ` · updated ${lastUpdate}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/box-sizes"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white transition-colors"
            style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.1)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            Box Sizes
          </Link>
          <button
            onClick={() => load()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white transition-colors"
            style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.1)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-4.64" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data && (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryCard label="Active Units"    value={data.totalActive}  color="text-sky-400"    sub="in production" />
            <SummaryCard label="Active Workers"  value={data.totalWorkers} color="text-violet-400" sub="on floor" />
            <SummaryCard
              label="Waiting Approval"
              value={waitingTotal}
              color={waitingTotal > 0 ? 'text-amber-400' : 'text-slate-400'}
              sub="pending review"
            />
            <SummaryCard
              label="In Rework"
              value={reworkCount}
              color={reworkCount > 0 ? 'text-red-400' : 'text-slate-400'}
              sub={blockedTotal > 0 ? `${blockedTotal} QC fail` : undefined}
            />
          </div>

          {/* Stage filter (horizontal scroll on mobile) */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => setFilterStage('ALL')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterStage === 'ALL'
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              All Stages
            </button>
            {STAGES.map((s) => {
              const count = data.stageCounts[s.key] ?? 0;
              return (
                <button
                  key={s.key}
                  onClick={() => setFilterStage(s.key)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filterStage === s.key
                      ? `bg-sky-500/20 text-sky-400 border border-sky-500/30`
                      : 'text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
                >
                  {s.short}
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      filterStage === s.key ? 'bg-sky-500/30 text-sky-300' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Stage columns — stacked on mobile, grid on desktop */}
          <div className={`grid gap-3 ${
            displayedStages.length === 1
              ? 'grid-cols-1'
              : displayedStages.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {displayedStages.map((s) => (
              <StageColumn
                key={s.key}
                stage={s}
                units={filteredUnits(s.key)}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-white/5">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest">Legend</p>
            {Object.entries(STATUS_CONFIG).map(([key, val]) => (
              <span key={key} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <span className={`w-2 h-2 rounded-full ${val.dot}`} />
                {val.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
