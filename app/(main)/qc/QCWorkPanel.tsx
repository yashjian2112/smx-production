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

// ─── QC Item definitions (same as QcChecklist) ────────────────────────────────

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

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string; badgeBg: string }> = {
  PENDING:          { label: 'Pending',          dot: 'bg-slate-500',   badge: '#94a3b8', badgeBg: 'rgba(148,163,184,0.10)' },
  IN_PROGRESS:      { label: 'In Progress',      dot: 'bg-sky-400',     badge: '#38bdf8', badgeBg: 'rgba(56,189,248,0.10)'  },
  WAITING_APPROVAL: { label: 'Waiting Approval', dot: 'bg-amber-400',   badge: '#fbbf24', badgeBg: 'rgba(251,191,36,0.10)'  },
  REJECTED_BACK:    { label: 'Rejected Back',    dot: 'bg-red-400',     badge: '#f87171', badgeBg: 'rgba(248,113,113,0.10)' },
};

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
  const [currentIdx, setCurrentIdx]         = useState(0);
  const [checks, setChecks]                 = useState<Checks>({});
  const [inputValue, setInputValue]         = useState('');
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [softwareVersion, setSoftwareVersion] = useState('');
  const [error, setError]                   = useState<string | null>(null);

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

        <div className="rounded-xl p-3 mb-4 flex items-center gap-3"
          style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-green-400">Unit</p>
            <p className="font-mono text-sm text-white mt-0.5">{unit.serialNumber}</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              {unit.order?.product.name ?? '—'} · {unit.order?.orderNumber ?? '—'}
            </p>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button onClick={startQC} disabled={phase === 'starting'}
          className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity"
          style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}>
          {phase === 'starting' ? 'Starting…' : 'Start QC Test'}
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

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function QCWorkPanel({ role }: { role: string }) {
  const [units, setUnits]         = useState<QCUnit[] | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<QCUnit | null>(null);

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

  const pending    = (units ?? []).filter((u) => u.currentStatus === 'PENDING');
  const inProgress = (units ?? []).filter((u) => u.currentStatus === 'IN_PROGRESS');
  const waiting    = (units ?? []).filter((u) => u.currentStatus === 'WAITING_APPROVAL');
  const rejected   = (units ?? []).filter((u) => u.currentStatus === 'REJECTED_BACK');

  // If a unit is selected, show the QC checklist
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
        <InlineQCChecklist
          unit={selected}
          onDone={() => { setSelected(null); load(); }}
        />
      </div>
    );
  }

  // Unit list
  return (
    <div className="max-w-lg mx-auto px-4 pb-24">
      <div className="pt-6 pb-4 flex items-center justify-between">
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

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && (units ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-zinc-700"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>
            <Check className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-zinc-400 text-sm font-medium">All clear</p>
          <p className="text-zinc-600 text-xs mt-1">No units waiting for QC</p>
        </div>
      )}

      {!loading && (units ?? []).length > 0 && (
        <div className="space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'In Progress', count: inProgress.length, color: '#38bdf8' },
              { label: 'Pending',     count: pending.length,    color: '#94a3b8' },
              { label: 'Waiting',     count: waiting.length,    color: '#fbbf24' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl p-3 text-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.count}</p>
                <p className="text-[10px] text-zinc-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Rejected back (priority) */}
          {rejected.length > 0 && (
            <UnitSection title="Needs Rework" units={rejected} onSelect={setSelected} accent="#f87171" />
          )}

          {/* In progress */}
          {inProgress.length > 0 && (
            <UnitSection title="In Progress" units={inProgress} onSelect={setSelected} accent="#38bdf8" />
          )}

          {/* Pending */}
          {pending.length > 0 && (
            <UnitSection title="Pending QC" units={pending} onSelect={setSelected} accent="#94a3b8" />
          )}

          {/* Waiting approval */}
          {waiting.length > 0 && (
            <UnitSection title="Waiting Approval" units={waiting} onSelect={setSelected} accent="#fbbf24" />
          )}
        </div>
      )}
    </div>
  );
}

// ─── UnitSection ─────────────────────────────────────────────────────────────

function UnitSection({
  title,
  units,
  onSelect,
  accent,
}: {
  title: string;
  units: QCUnit[];
  onSelect: (u: QCUnit) => void;
  accent: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: accent }} />
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">{title}</p>
        <span className="text-[11px] px-1.5 py-0.5 rounded font-bold"
          style={{ background: `${accent}18`, color: accent }}>
          {units.length}
        </span>
      </div>
      <div className="space-y-2">
        {units.map((u) => {
          const cfg = STATUS_CONFIG[u.currentStatus] ?? STATUS_CONFIG.PENDING;
          const canWork = ['PENDING', 'IN_PROGRESS', 'REJECTED_BACK'].includes(u.currentStatus);
          return (
            <div key={u.id} className="card p-3">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-white">{u.serialNumber}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ color: cfg.badge, background: cfg.badgeBg }}>
                      {cfg.label}
                    </span>
                    {u.currentStatus === 'REJECTED_BACK' && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ color: '#fb923c', background: 'rgba(251,146,60,0.10)', border: '1px solid rgba(251,146,60,0.2)' }}>
                        Needs Rework
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {u.order?.product.name ?? '—'} · {u.order?.orderNumber ?? '—'}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {u.assignedTo && (
                      <p className="text-[10px] text-zinc-500">{u.assignedTo.name}</p>
                    )}
                    <div className="flex items-center gap-1 text-[10px] text-zinc-600">
                      <Clock className="w-2.5 h-2.5" />
                      {elapsed(u.updatedAt)}
                    </div>
                  </div>
                </div>
                {canWork && (
                  <button
                    onClick={() => onSelect(u)}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold flex-shrink-0"
                    style={{ background: 'rgba(52,211,153,0.10)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>
                    Start QC <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
