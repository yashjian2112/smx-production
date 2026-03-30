'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, ChevronRight, Clock } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type QCUnit = {
  id: string;
  serialNumber: string;
  currentStatus: string;
  updatedAt: string;
  qcBarcode: string | null;
  assignedTo: { id: string; name: string } | null;
  order: {
    id: string;
    orderNumber: string;
    product: { name: string; code: string };
  } | null;
};

// ─── QC Item definitions ──────────────────────────────────────────────────────

const QC_ITEMS = [
  { key: 'vin',         label: 'VIN'         },
  { key: 'aux_supply',  label: 'AUX Supply'  },
  { key: 'resolver',    label: 'Resolver'    },
  { key: 'kill_switch', label: 'Kill Switch' },
  { key: 'mode',        label: 'Mode'        },
  { key: 'can',         label: 'CAN'         },
  { key: 'hall',        label: 'Hall'        },
  { key: 'throttle',    label: 'Throttle'    },
  { key: 'cruise',      label: 'Cruise'      },
  { key: 'usb',         label: 'USB'         },
  { key: 'vincos',      label: 'VINCOS'      },
] as const;

type ItemKey = typeof QC_ITEMS[number]['key'];
type CheckResult = { status: 'PASS' | 'NA'; value: string };
type Checks = Partial<Record<ItemKey, CheckResult>>;
type Phase = 'idle' | 'starting' | 'checklist' | 'summary' | 'submitting' | 'done';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Inline QC Checklist ─────────────────────────────────────────────────────

function InlineQCChecklist({
  unit,
  onDone,
}: {
  unit: QCUnit;
  onDone: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>(
    unit.currentStatus === 'IN_PROGRESS' ? 'checklist' : 'idle'
  );
  const [currentIdx, setCurrentIdx]           = useState(0);
  const [checks, setChecks]                   = useState<Checks>({});
  const [inputValue, setInputValue]           = useState('');
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [softwareVersion, setSoftwareVersion] = useState('');
  const [error, setError]                     = useState<string | null>(null);

  const completedCount = QC_ITEMS.filter((i) => checks[i.key]).length;
  const currentItem    = QC_ITEMS[currentIdx];

  useEffect(() => {
    if (phase === 'checklist') {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [phase, currentIdx]);

  async function startQC() {
    setPhase('starting');
    setError(null);
    try {
      const res = await fetch(`/api/units/${unit.id}/work`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? 'Failed to start QC');
      }
      setPhase('checklist');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error starting QC');
      setPhase('idle');
    }
  }

  const markCurrent = useCallback(
    (result: 'PASS' | 'NA') => {
      const val = result === 'NA' ? 'N/A' : inputValue.trim();
      if (result === 'PASS' && !val) {
        setError('Enter a value before marking pass');
        inputRef.current?.focus();
        return;
      }
      setError(null);
      const newChecks: Checks = { ...checks, [currentItem.key]: { status: result, value: val } };
      setChecks(newChecks);
      setInputValue('');
      if (currentIdx < QC_ITEMS.length - 1) {
        setCurrentIdx((i) => i + 1);
      } else {
        setPhase('summary');
      }
    },
    [inputValue, checks, currentItem, currentIdx]
  );

  function editItem(idx: number) {
    const existing = checks[QC_ITEMS[idx].key];
    setInputValue(existing?.value === 'N/A' ? '' : (existing?.value ?? ''));
    const trimmed: Checks = {};
    QC_ITEMS.slice(0, idx).forEach((item) => {
      if (checks[item.key]) trimmed[item.key] = checks[item.key];
    });
    setChecks(trimmed);
    setCurrentIdx(idx);
    setPhase('checklist');
  }

  async function submitResult(result: 'PASS' | 'FAIL') {
    setPhase('submitting');
    setError(null);
    try {
      const res = await fetch(`/api/units/${unit.id}/qc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result,
          checklistData: checks,
          firmwareVersion: firmwareVersion || undefined,
          softwareVersion: softwareVersion || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? 'Submission failed');
      }
      setPhase('done');
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error submitting');
      setPhase('summary');
    }
  }

  const card = {
    background: 'rgba(255,255,255,0.02)',
    border:     '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 20,
  };

  // ── DONE ────────────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div style={card} className="text-center py-6">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <Check className="w-6 h-6 text-green-400" />
        </div>
        <p className="text-white font-semibold text-base">QC Submitted</p>
        <p className="text-zinc-500 text-sm mt-1">{unit.serialNumber}</p>
        <button onClick={onDone}
          className="mt-4 px-5 py-2 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.2)', color: '#38bdf8' }}>
          Back to Queue
        </button>
      </div>
    );
  }

  // ── IDLE / STARTING ─────────────────────────────────────────────────────────
  if (phase === 'idle' || phase === 'starting') {
    const isRework = unit.currentStatus === 'REJECTED_BACK';
    return (
      <div style={card}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400 mb-3">
          QC &amp; Software Test
        </p>
        <h3 className="text-base font-semibold text-white mb-1">Quality Control Checklist</h3>
        <p className="text-zinc-500 text-sm mb-4">
          {QC_ITEMS.length} test items · Enter measured value or mark N/A
        </p>
        <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 mb-5">
          {QC_ITEMS.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5 text-xs text-zinc-600">
              <div className="w-1 h-1 rounded-full bg-zinc-700 shrink-0" />
              {item.label}
            </div>
          ))}
        </div>

        <div className="rounded-xl p-3 mb-4"
          style={{
            background: isRework ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.05)',
            border: `1px solid ${isRework ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.2)'}`,
          }}>
          <div className="flex items-start gap-3">
            <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: isRework ? '#f87171' : '#4ade80' }} />
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: isRework ? '#f87171' : '#4ade80' }}>Unit</p>
              <p className="font-mono text-sm text-white">{unit.serialNumber}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {unit.order?.product.name ?? '—'} · {unit.order?.orderNumber ?? '—'}
              </p>
            </div>
            {isRework && (
              <span className="text-[9px] font-bold px-2 py-1 rounded uppercase tracking-widest"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                Rework
              </span>
            )}
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button onClick={startQC} disabled={phase === 'starting'}
          className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity"
          style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}>
          {phase === 'starting' ? 'Starting…' : isRework ? 'Re-run QC Test' : 'Start QC Test'}
        </button>
      </div>
    );
  }

  // ── CHECKLIST ────────────────────────────────────────────────────────────────
  if (phase === 'checklist') {
    return (
      <div style={card}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500">{completedCount + 1} / {QC_ITEMS.length}</span>
          <span className="text-xs text-zinc-600">QC in progress</span>
        </div>
        <div className="h-1.5 rounded-full mb-5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(completedCount / QC_ITEMS.length) * 100}%`, background: '#38bdf8' }} />
        </div>

        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Test Item</p>
        <p className="text-2xl font-bold text-white mb-4">{currentItem.label}</p>

        <label className="block text-xs text-zinc-500 mb-1.5">Measured Value</label>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') markCurrent('PASS'); }}
          placeholder="Enter value…"
          className="w-full px-3 py-3 rounded-xl text-sm text-white placeholder-zinc-700 outline-none mb-3"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
        />
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex gap-2 mb-5">
          <button onClick={() => markCurrent('PASS')}
            className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
            <Check className="w-4 h-4" /> Pass
          </button>
          <button onClick={() => markCurrent('NA')}
            className="py-3 px-5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#71717a' }}>
            N/A
          </button>
        </div>

        {completedCount > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Completed</p>
            {QC_ITEMS.slice(0, completedCount).map((item, idx) => {
              const r = checks[item.key];
              return (
                <button key={item.key} onClick={() => editItem(idx)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-white/5"
                  style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="text-zinc-400">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={r?.status === 'NA' ? 'text-zinc-500' : 'text-green-400 font-mono'}>
                      {r?.value ?? '—'}
                    </span>
                    <span className="text-[10px] text-zinc-600">edit</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── SUMMARY ──────────────────────────────────────────────────────────────────
  if (phase === 'summary' || phase === 'submitting') {
    const failCount = QC_ITEMS.filter((i) => {
      const r = checks[i.key];
      return !r || r.status !== 'PASS';
    }).length;

    return (
      <div style={card}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-4">
          Review &amp; Submit
        </p>

        {/* Firmware / Software */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Firmware Version</label>
            <input type="text" value={firmwareVersion}
              onChange={(e) => setFirmwareVersion(e.target.value)}
              placeholder="e.g. v2.4.1"
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-zinc-700 outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Software Version</label>
            <input type="text" value={softwareVersion}
              onChange={(e) => setSoftwareVersion(e.target.value)}
              placeholder="e.g. v1.2.0"
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-zinc-700 outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
        </div>

        {/* Results table */}
        <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          {QC_ITEMS.map((item, idx) => {
            const r = checks[item.key];
            const pass = r?.status === 'PASS';
            return (
              <div key={item.key}
                className={`flex items-center justify-between px-3 py-2 text-xs ${idx > 0 ? 'border-t' : ''}`}
                style={idx > 0 ? { borderColor: 'rgba(255,255,255,0.05)' } : undefined}>
                <button onClick={() => editItem(idx)} className="text-zinc-400 hover:text-white transition-colors text-left">
                  {item.label}
                </button>
                <span className={pass ? 'text-green-400 font-mono' : r?.status === 'NA' ? 'text-zinc-500' : 'text-zinc-600'}>
                  {r?.value ?? '—'}
                </span>
              </div>
            );
          })}
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-2">
          <button onClick={() => submitResult('PASS')}
            disabled={phase === 'submitting'}
            className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
            <Check className="w-4 h-4" />
            {phase === 'submitting' ? 'Submitting…' : 'Submit PASS'}
          </button>
          {failCount > 0 && (
            <button onClick={() => submitResult('FAIL')}
              disabled={phase === 'submitting'}
              className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
              <X className="w-4 h-4" />
              Submit FAIL
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}

// Status badge config
const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:          { label: 'Pending',          color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
  IN_PROGRESS:      { label: 'In Progress',      color: '#38bdf8', bg: 'rgba(56,189,248,0.10)'  },
  WAITING_APPROVAL: { label: 'Awaiting Approval', color: '#fbbf24', bg: 'rgba(251,191,36,0.10)'  },
  REJECTED_BACK:    { label: 'Rework',           color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
};

// ─── Unit Card ────────────────────────────────────────────────────────────────

function UnitCard({
  unit,
  onSelect,
}: {
  unit: QCUnit;
  onSelect: (u: QCUnit) => void;
}) {
  const isRework  = unit.currentStatus === 'REJECTED_BACK';
  const isWaiting = unit.currentStatus === 'WAITING_APPROVAL';

  const accentColor  = isRework ? '#f87171' : isWaiting ? '#fbbf24' : unit.currentStatus === 'IN_PROGRESS' ? '#38bdf8' : '#94a3b8';
  const accentBg     = isRework ? 'rgba(248,113,113,0.06)' : isWaiting ? 'rgba(251,191,36,0.06)' : unit.currentStatus === 'IN_PROGRESS' ? 'rgba(56,189,248,0.06)' : 'rgba(148,163,184,0.04)';
  const accentBorder = isRework ? 'rgba(248,113,113,0.2)' : isWaiting ? 'rgba(251,191,36,0.18)' : unit.currentStatus === 'IN_PROGRESS' ? 'rgba(56,189,248,0.18)' : 'rgba(148,163,184,0.10)';

  const badge = STATUS_BADGE[unit.currentStatus] ?? STATUS_BADGE.PENDING;

  return (
    <button
      type="button"
      onClick={() => onSelect(unit)}
      className="w-full text-left rounded-xl p-3 relative overflow-hidden transition-opacity hover:opacity-90 active:opacity-75"
      style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>

      {/* Rework seal — top-right stamp */}
      {isRework && (
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest pointer-events-none"
          style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171' }}>
          Rework
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Status dot */}
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: accentColor }} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-sm font-semibold text-white leading-tight">{unit.serialNumber}</p>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ color: badge.color, background: badge.bg }}>
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            {unit.order?.product.name ?? '—'} · <span className="text-zinc-500">{unit.order?.orderNumber ?? '—'}</span>
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            {unit.assignedTo && (
              <p className="text-[10px] text-zinc-500">{unit.assignedTo.name}</p>
            )}
            <div className="flex items-center gap-1 text-[10px] text-zinc-600">
              <Clock className="w-2.5 h-2.5" />
              {elapsed(unit.updatedAt)}
            </div>
            {/* Tap hint */}
            {!isWaiting && (
              <div className="ml-auto flex items-center gap-0.5 text-[10px]" style={{ color: accentColor, opacity: 0.7 }}>
                {isRework ? 'Re-run' : 'Open'} <ChevronRight className="w-3 h-3" />
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function QCWorkPanel({ role }: { role: string }) {
  const [units, setUnits]       = useState<QCUnit[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<QCUnit | null>(null);
  const [tab, setTab]           = useState<'pending' | 'processing'>('pending');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/qc/units');
      const data = await res.json() as QCUnit[];
      setUnits(res.ok ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Tab buckets
  const pending    = (units ?? []).filter((u) => u.currentStatus === 'PENDING');
  const processing = (units ?? []).filter((u) => ['IN_PROGRESS', 'WAITING_APPROVAL', 'REJECTED_BACK'].includes(u.currentStatus));

  // If a unit is selected, show the QC checklist (or awaiting approval screen)
  if (selected) {
    return (
      <div className="max-w-lg mx-auto px-4 pb-24">
        <div className="pt-6 pb-4 flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-sm text-zinc-400 hover:text-white transition-colors">
            ← Back
          </button>
          <div className="flex-1">
            <h1 className="text-white font-semibold text-base font-mono">{selected.serialNumber}</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              {selected.order?.product.name ?? 'Unknown'} · {selected.order?.orderNumber ?? '—'}
            </p>
          </div>
        </div>

        {selected.currentStatus === 'WAITING_APPROVAL' ? (
          /* Read-only: QC already submitted, waiting for manager approval */
          <div className="rounded-2xl p-6 text-center"
            style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.25)' }}>
              <Check className="w-6 h-6 text-amber-400" />
            </div>
            <p className="text-white font-semibold text-base">QC Submitted</p>
            <p className="text-amber-400 text-xs font-semibold mt-1 uppercase tracking-widest">Awaiting Manager Approval</p>
            <p className="text-zinc-500 text-sm mt-2">
              QC test results have been submitted for this unit.<br />
              A production manager will review and approve shortly.
            </p>
            <button onClick={() => setSelected(null)}
              className="mt-5 px-5 py-2 rounded-xl text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#a1a1aa' }}>
              Back to Queue
            </button>
          </div>
        ) : (
          <InlineQCChecklist
            unit={selected}
            onDone={() => { setSelected(null); load(); }}
          />
        )}
      </div>
    );
  }

  const tabUnits = tab === 'pending' ? pending : processing;

  return (
    <div className="max-w-lg mx-auto px-4 pb-24">
      {/* Header */}
      <div className="pt-6 pb-3 flex items-center justify-between">
        <div>
          <h1 className="text-white text-xl font-bold">QC Work</h1>
          <p className="text-zinc-500 text-sm mt-0.5">QC &amp; Software testing queue</p>
        </div>
        <button onClick={load}
          className="text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl overflow-hidden mb-4"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {([
          { key: 'pending',    label: 'Pending',    count: pending.length,    color: '#94a3b8' },
          { key: 'processing', label: 'Processing', count: processing.length, color: '#38bdf8' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-colors"
            style={tab === t.key
              ? { background: 'rgba(255,255,255,0.08)', color: t.color }
              : { color: '#52525b' }}>
            {t.label}
            {t.count > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                style={{ background: tab === t.key ? `${t.color}20` : 'rgba(255,255,255,0.06)', color: tab === t.key ? t.color : '#52525b' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tabUnits.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-zinc-700"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-zinc-400 text-sm font-medium">
            {tab === 'pending' ? 'No units pending QC' : 'Nothing in progress'}
          </p>
          <p className="text-zinc-600 text-xs mt-1">
            {tab === 'pending' ? 'All units have been picked up' : 'No active or rework units'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tabUnits.map((u) => (
            <UnitCard key={u.id} unit={u} onSelect={setSelected} />
          ))}
        </div>
      )}
    </div>
  );
}
