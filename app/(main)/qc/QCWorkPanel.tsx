'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, ChevronRight, Clock, Printer, ChevronDown } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type QCUnit = {
  id: string;
  serialNumber: string;
  currentStatus: string;
  updatedAt: string;
  assemblyBarcode: string | null;
  qcBarcode: string | null;
  assignedTo: { id: string; name: string } | null;
  reworkRecord: { id: string; cycleCount: number; createdAt: string } | null;
  order: {
    id: string;
    orderNumber: string;
    product: { name: string; code: string };
  } | null;
};

type ChecklistData = Record<string, { status: string; value: string }>;

type CompletedUnit = QCUnit & {
  qcResult:        'PASS' | 'FAIL';
  qcPassedBy:     { id: string; name: string } | null;
  firmwareVersion: string | null;
  softwareVersion: string | null;
  checklistData:   ChecklistData | null;
  hadRework:       boolean;
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
type CheckResult = { status: 'PASS' | 'FAIL' | 'NA'; value: string };
type Checks = Partial<Record<ItemKey, CheckResult>>;
type Phase = 'verify' | 'idle' | 'starting' | 'checklist' | 'summary' | 'submitting' | 'done';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:       { label: 'Pending',     color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
  IN_PROGRESS:   { label: 'In Progress', color: '#38bdf8', bg: 'rgba(56,189,248,0.10)'  },
  REJECTED_BACK: { label: 'Rework',      color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
};

// ─── Inline QC Checklist ─────────────────────────────────────────────────────

type IssueCategory = { id: string; code: string; name: string };

const SOURCE_STAGE_OPTIONS = [
  { value: 'POWERSTAGE_MANUFACTURING', label: 'Powerstage Manufacturing' },
  { value: 'BRAINBOARD_MANUFACTURING', label: 'Brainboard Manufacturing' },
  { value: 'CONTROLLER_ASSEMBLY',      label: 'Controller Assembly'      },
  { value: 'QC_AND_SOFTWARE',          label: 'QC & Software'            },
];

function InlineQCChecklist({ unit, onDone }: { unit: QCUnit; onDone: () => void }) {
  const router   = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase]                     = useState<Phase>(
    unit.currentStatus === 'IN_PROGRESS' ? 'checklist' : 'verify'
  );
  const [scanInput,  setScanInput]  = useState('');
  const [scanError,  setScanError]  = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [currentIdx, setCurrentIdx]           = useState(0);
  const [checks, setChecks]                   = useState<Checks>({});
  const [inputValue, setInputValue]           = useState('');
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [softwareVersion, setSoftwareVersion] = useState('');
  const [error, setError]                     = useState<string | null>(null);
  const [issueCategories, setIssueCategories] = useState<IssueCategory[]>([]);
  const [issueCategoryId, setIssueCategoryId] = useState('');
  const [sourceStage, setSourceStage]         = useState('');
  const [failRemarks, setFailRemarks]         = useState('');

  useEffect(() => {
    fetch('/api/qc/issue-categories')
      .then((r) => r.ok ? r.json() : [])
      .then((d: IssueCategory[]) => setIssueCategories(d))
      .catch(() => {});
  }, []);

  const completedCount = QC_ITEMS.filter((i) => checks[i.key]).length;
  const currentItem    = QC_ITEMS[currentIdx];

  useEffect(() => {
    if (phase === 'checklist') setTimeout(() => inputRef.current?.focus(), 80);
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
    (result: 'PASS' | 'FAIL' | 'NA') => {
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
    QC_ITEMS.slice(0, idx).forEach((item) => { if (checks[item.key]) trimmed[item.key] = checks[item.key]; });
    setChecks(trimmed);
    setCurrentIdx(idx);
    setPhase('checklist');
  }

  async function submitResult(result: 'PASS' | 'FAIL') {
    if (result === 'FAIL') {
      if (!issueCategoryId)        { setError('Select an error code before submitting FAIL'); return; }
      if (!sourceStage)            { setError('Select the defect origin stage before submitting FAIL'); return; }
      if (!failRemarks.trim())     { setError('Describe the defect before submitting FAIL'); return; }
    }
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
          issueCategoryId: result === 'FAIL' ? issueCategoryId    : undefined,
          sourceStage:     result === 'FAIL' ? sourceStage        : undefined,
          remarks:         result === 'FAIL' ? failRemarks.trim() : undefined,
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
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 20,
  };

  if (phase === 'done') {
    return (
      <div style={card} className="text-center py-6">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <Check className="w-6 h-6 text-green-400" />
        </div>
        <p className="text-white font-semibold text-base">QC Submitted</p>
        <p className="text-zinc-500 text-sm mt-1">{unit.serialNumber}</p>
        <button onClick={onDone} className="mt-4 px-5 py-2 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.2)', color: '#38bdf8' }}>
          Back to Queue
        </button>
      </div>
    );
  }

  // ── Barcode scan verification ─────────────────────────────────────────────
  // Rework units already have a QC barcode sticker → scan that.
  // Fresh units have an assembly barcode sticker → scan that.
  const isReworkUnit = unit.currentStatus === 'REJECTED_BACK';
  const expectedBarcode = isReworkUnit
    ? (unit.qcBarcode ?? unit.assemblyBarcode)
    : (unit.assemblyBarcode ?? unit.qcBarcode);

  function handleScanVerify() {
    const entered = scanInput.trim();
    if (!entered) { setScanError('Scan or enter the barcode'); scanRef.current?.focus(); return; }
    if (expectedBarcode && entered !== expectedBarcode) {
      setScanError('Barcode mismatch — please scan the correct unit');
      setScanInput('');
      scanRef.current?.focus();
      return;
    }
    setScanError(null);
    setPhase('idle');
  }

  if (phase === 'verify') {
    return (
      <div style={card}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400 mb-3">Unit Verification</p>
        <h3 className="text-base font-semibold text-white mb-1">
          {isReworkUnit ? 'Scan QC Barcode' : 'Scan Assembly Barcode'}
        </h3>
        <p className="text-zinc-500 text-sm mb-5">
          {isReworkUnit
            ? 'Scan the QC barcode sticker on the unit from the previous test.'
            : 'Scan the assembly barcode label on the physical unit to confirm you have the correct unit.'}
        </p>
        <div className="rounded-xl p-3 mb-5"
          style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.15)' }}>
          <p className="text-[10px] text-zinc-500 mb-1">Scan this barcode</p>
          {expectedBarcode ? (
            <p className="font-mono text-base font-bold mb-0.5"
              style={{ color: isReworkUnit ? '#34d399' : '#38bdf8' }}>
              {expectedBarcode}
            </p>
          ) : (
            <p className="font-mono text-xs text-zinc-500 italic mb-0.5">No barcode on record — scan any barcode</p>
          )}
          <p className="font-mono text-[10px] text-zinc-500">{unit.serialNumber}</p>
          <p className="text-xs text-zinc-500 mt-0.5">{unit.order?.product.name} · {unit.order?.orderNumber}</p>
        </div>
        <label className="block text-xs text-zinc-500 mb-1.5">Scan Result</label>
        <input
          ref={scanRef}
          autoFocus
          type="text"
          value={scanInput}
          onChange={(e) => { setScanInput(e.target.value); setScanError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleScanVerify(); }}
          placeholder={expectedBarcode ? `Scan ${expectedBarcode}…` : 'Scan barcode…'}
          className="w-full px-3 py-3 rounded-xl text-sm text-white placeholder-zinc-700 outline-none mb-3 font-mono"
          style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${scanError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}` }}
        />
        {scanError && <p className="text-red-400 text-sm mb-3">{scanError}</p>}
        <button onClick={handleScanVerify}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity"
          style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}>
          Verify &amp; Proceed
        </button>
      </div>
    );
  }

  if (phase === 'idle' || phase === 'starting') {
    const isRework = unit.currentStatus === 'REJECTED_BACK';
    return (
      <div style={card}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400 mb-3">QC &amp; Software Test</p>
        <h3 className="text-base font-semibold text-white mb-1">Quality Control Checklist</h3>
        <p className="text-zinc-500 text-sm mb-4">{QC_ITEMS.length} test items · Enter measured value or mark N/A</p>
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
              <p className="text-xs text-zinc-500 mt-0.5">{unit.order?.product.name ?? '—'} · {unit.order?.orderNumber ?? '—'}</p>
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
        <input ref={inputRef} type="text" value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') markCurrent('PASS'); }}
          placeholder="Enter value…"
          className="w-full px-3 py-3 rounded-xl text-sm text-white placeholder-zinc-700 outline-none mb-3"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex gap-2 mb-5">
          <button onClick={() => markCurrent('PASS')}
            className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
            <Check className="w-4 h-4" /> Pass
          </button>
          <button onClick={() => markCurrent('FAIL')}
            className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
            <X className="w-4 h-4" /> Fail
          </button>
          <button onClick={() => markCurrent('NA')}
            className="py-3 px-4 rounded-xl text-sm font-semibold"
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
                    <span className={r?.status === 'NA' ? 'text-zinc-500' : r?.status === 'FAIL' ? 'text-red-400 font-mono' : 'text-green-400 font-mono'}>{r?.value || (r?.status === 'FAIL' ? 'FAIL' : '—')}</span>
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

  if (phase === 'summary' || phase === 'submitting') {
    const failCount = QC_ITEMS.filter((i) => { const r = checks[i.key]; return r?.status === 'FAIL'; }).length;
    const hasFailItems = failCount > 0;
    const canSubmitFail = issueCategoryId && sourceStage && failRemarks.trim();

    return (
      <div style={card}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-4">Review &amp; Submit</p>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Firmware Version</label>
            <input type="text" value={firmwareVersion} onChange={(e) => setFirmwareVersion(e.target.value)}
              placeholder="e.g. v2.4.1" className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-zinc-700 outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Software Version</label>
            <input type="text" value={softwareVersion} onChange={(e) => setSoftwareVersion(e.target.value)}
              placeholder="e.g. v1.2.0" className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-zinc-700 outline-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
          </div>
        </div>
        <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          {QC_ITEMS.map((item, idx) => {
            const r = checks[item.key];
            const pass = r?.status === 'PASS';
            return (
              <div key={item.key}
                className={`flex items-center justify-between px-3 py-2 text-xs ${idx > 0 ? 'border-t' : ''}`}
                style={idx > 0 ? { borderColor: 'rgba(255,255,255,0.05)' } : undefined}>
                <button onClick={() => editItem(idx)} className="text-zinc-400 hover:text-white transition-colors text-left">{item.label}</button>
                <span className={pass ? 'text-green-400 font-mono' : r?.status === 'NA' ? 'text-zinc-500' : r?.status === 'FAIL' ? 'text-red-400 font-mono' : 'text-zinc-600'}>{r?.value || (r?.status === 'FAIL' ? 'FAIL' : '—')}</span>
              </div>
            );
          })}
        </div>

        {/* ── FAIL details — mandatory when any item failed ── */}
        {hasFailItems && (
          <div className="rounded-xl p-4 mb-4 space-y-3"
            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">
              Fail Details — Required
            </p>

            {/* Error code */}
            <div>
              <label className="block text-xs mb-1.5" style={{ color: issueCategoryId ? '#94a3b8' : '#f87171' }}>
                Error Code <span className="text-red-400">*</span>
              </label>
              <select value={issueCategoryId} onChange={(e) => { setIssueCategoryId(e.target.value); setError(null); }}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${issueCategoryId ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.4)'}`,
                }}>
                <option value="" disabled style={{ background: '#1e293b' }}>Select error code…</option>
                {issueCategories.map((c) => (
                  <option key={c.id} value={c.id} style={{ background: '#1e293b' }}>[{c.code}] {c.name}</option>
                ))}
              </select>
            </div>

            {/* Defect source stage */}
            <div>
              <label className="block text-xs mb-1" style={{ color: sourceStage ? '#94a3b8' : '#f87171' }}>
                Defect Origin Stage <span className="text-red-400">*</span>
              </label>
              <p className="text-[10px] text-zinc-600 mb-1.5">Which stage introduced this defect? (for reporting only — unit always returns to Assembly)</p>
              <select value={sourceStage} onChange={(e) => { setSourceStage(e.target.value); setError(null); }}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${sourceStage ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.4)'}`,
                }}>
                <option value="" disabled style={{ background: '#1e293b' }}>Select origin stage…</option>
                {SOURCE_STAGE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value} style={{ background: '#1e293b' }}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Defect description */}
            <div>
              <label className="block text-xs mb-1.5" style={{ color: failRemarks.trim() ? '#94a3b8' : '#f87171' }}>
                Defect Description <span className="text-red-400">*</span>
              </label>
              <textarea
                value={failRemarks}
                onChange={(e) => { setFailRemarks(e.target.value); setError(null); }}
                placeholder="Describe the defect in detail…"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-zinc-700 outline-none resize-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${failRemarks.trim() ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.4)'}`,
                }}
              />
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => submitResult('PASS')} disabled={phase === 'submitting'}
            className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
            <Check className="w-4 h-4" />
            {phase === 'submitting' ? 'Submitting…' : 'Submit PASS'}
          </button>
          <button
            onClick={() => submitResult('FAIL')}
            disabled={phase === 'submitting' || (hasFailItems && !canSubmitFail)}
            className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
            <X className="w-4 h-4" />
            Submit FAIL
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Order Group (full-width accordion for pending/processing tabs) ──────────

type OrderGroup = {
  orderId:     string;
  orderNumber: string;
  productName: string;
  units:       QCUnit[];
};

function groupByOrder(units: QCUnit[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();
  for (const u of units) {
    const key = u.order?.id ?? '__unknown__';
    if (!map.has(key)) {
      map.set(key, {
        orderId:     u.order?.id ?? '',
        orderNumber: u.order?.orderNumber ?? 'Unknown Order',
        productName: u.order?.product.name ?? '—',
        units: [],
      });
    }
    map.get(key)!.units.push(u);
  }
  return Array.from(map.values());
}

function OrderGroupAccordion({ group, onSelect }: { group: OrderGroup; onSelect: (u: QCUnit) => void }) {
  const reworkCount = group.units.filter((u) => u.currentStatus === 'REJECTED_BACK').length;
  const activeCount  = group.units.filter((u) => u.currentStatus === 'IN_PROGRESS').length;

  return (
    <div className="rounded-xl overflow-hidden w-full" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
      {/* Order header */}
      <div className="w-full flex items-center gap-3 px-4 py-2.5"
        style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-white">{group.orderNumber}</span>
          <span className="text-xs text-zinc-400">{group.productName}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {reworkCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
              {reworkCount} rework
            </span>
          )}
          {activeCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}>
              {activeCount} active
            </span>
          )}
          <span className="text-[10px] text-zinc-500">{group.units.length} unit{group.units.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Unit rows */}
      <div>
        {group.units.map((u, i) => (
          <div key={u.id} style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.05)' } : undefined}>
            <UnitRow unit={u} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Unit Row (inside order accordion) ───────────────────────────────────────

function UnitRow({ unit, onSelect }: { unit: QCUnit; onSelect: (u: QCUnit) => void }) {
  const isRework = unit.currentStatus === 'REJECTED_BACK';
  const isActive = unit.currentStatus === 'IN_PROGRESS';
  const accentColor = isRework ? '#f87171' : isActive ? '#38bdf8' : '#94a3b8';
  const badge = STATUS_BADGE[unit.currentStatus] ?? STATUS_BADGE.PENDING;
  // For rework units show the rework record short ID, otherwise show serial
  const reworkShortId = unit.reworkRecord
    ? 'RW-' + unit.reworkRecord.id.slice(-6).toUpperCase()
    : null;

  return (
    <button type="button" onClick={() => onSelect(unit)}
      className="w-full text-left flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]">
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accentColor }} />
      <div className="flex flex-col min-w-0">
        {isRework && reworkShortId ? (
          <>
            <p className="font-mono text-sm font-semibold leading-tight" style={{ color: '#f87171' }}>{reworkShortId}</p>
            <p className="font-mono text-[10px] text-zinc-500 leading-tight">{unit.serialNumber}</p>
          </>
        ) : (
          <p className="font-mono text-sm font-semibold text-white leading-tight">{unit.serialNumber}</p>
        )}
      </div>
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
        style={{ color: badge.color, background: badge.bg }}>{badge.label}</span>
      {isRework && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
          Cycle {unit.reworkRecord?.cycleCount ?? 1}
        </span>
      )}
      <div className="flex items-center gap-1 text-[10px] text-zinc-600 ml-auto flex-shrink-0">
        <Clock className="w-2.5 h-2.5" />{elapsed(unit.updatedAt)}
        <ChevronRight className="w-3 h-3 ml-1" style={{ color: accentColor, opacity: 0.6 }} />
      </div>
    </button>
  );
}

// ─── Unit Card (active) ───────────────────────────────────────────────────────

function UnitCard({ unit, onSelect }: { unit: QCUnit; onSelect: (u: QCUnit) => void }) {
  const isRework = unit.currentStatus === 'REJECTED_BACK';
  const isActive = unit.currentStatus === 'IN_PROGRESS';
  const accentColor  = isRework ? '#f87171' : isActive ? '#38bdf8' : '#94a3b8';
  const accentBg     = isRework ? 'rgba(248,113,113,0.06)' : isActive ? 'rgba(56,189,248,0.06)' : 'rgba(148,163,184,0.04)';
  const accentBorder = isRework ? 'rgba(248,113,113,0.2)'  : isActive ? 'rgba(56,189,248,0.18)'  : 'rgba(148,163,184,0.10)';
  const badge = STATUS_BADGE[unit.currentStatus] ?? STATUS_BADGE.PENDING;

  return (
    <button type="button" onClick={() => onSelect(unit)}
      className="w-full text-left rounded-xl p-3 relative overflow-hidden transition-opacity hover:opacity-90 active:opacity-75"
      style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
      {isRework && (
        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest pointer-events-none"
          style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171' }}>
          Rework
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: accentColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-sm font-semibold text-white leading-tight">{unit.serialNumber}</p>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ color: badge.color, background: badge.bg }}>{badge.label}</span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            {unit.order?.product.name ?? '—'} · <span className="text-zinc-500">{unit.order?.orderNumber ?? '—'}</span>
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            {unit.assignedTo && <p className="text-[10px] text-zinc-500">{unit.assignedTo.name}</p>}
            <div className="flex items-center gap-1 text-[10px] text-zinc-600">
              <Clock className="w-2.5 h-2.5" />{elapsed(unit.updatedAt)}
            </div>
            <div className="ml-auto flex items-center gap-0.5 text-[10px]" style={{ color: accentColor, opacity: 0.7 }}>
              {isRework ? 'Re-run' : 'Open'} <ChevronRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Completed Card — expandable with full test results + print PDF ──────────

function CompletedCard({ unit }: { unit: CompletedUnit }) {
  const [expanded, setExpanded] = useState(false);
  const isFail = unit.qcResult === 'FAIL';

  const accentColor  = isFail ? '#f87171'              : '#4ade80';
  const accentBg     = isFail ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)';
  const accentBorder = isFail ? 'rgba(239,68,68,0.2)'  : 'rgba(34,197,94,0.18)';
  const dividerColor = isFail ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)';

  const passCount = unit.checklistData
    ? QC_ITEMS.filter((i) => unit.checklistData![i.key]?.status === 'PASS').length
    : null;
  const failCount = unit.checklistData
    ? QC_ITEMS.filter((i) => unit.checklistData![i.key]?.status === 'FAIL').length
    : null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>

      {/* ── Summary row ── */}
      <button type="button" onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: accentColor }} />
          <div className="flex-1 min-w-0">

            {/* Serial + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-mono text-sm font-semibold text-white leading-tight">{unit.serialNumber}</p>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ color: accentColor, background: isFail ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)' }}>
                {isFail ? 'QC Fail' : 'QC Pass'}
              </span>
              {unit.hadRework && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
                  style={{ color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  Rework
                </span>
              )}
            </div>

            {/* Product / order */}
            <p className="text-xs text-zinc-400 mt-0.5">
              {unit.order?.product.name ?? '—'} · <span className="text-zinc-500">{unit.order?.orderNumber ?? '—'}</span>
            </p>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {unit.qcPassedBy && <p className="text-[10px] text-zinc-500">By {unit.qcPassedBy.name}</p>}
              {unit.firmwareVersion && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{ color: '#94a3b8', background: 'rgba(148,163,184,0.08)' }}>
                  FW {unit.firmwareVersion}
                </span>
              )}
              {unit.softwareVersion && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{ color: '#94a3b8', background: 'rgba(148,163,184,0.08)' }}>
                  SW {unit.softwareVersion}
                </span>
              )}
              {passCount !== null && failCount !== null && (
                <span className="text-[10px] text-zinc-500">
                  {passCount} pass · <span style={{ color: failCount > 0 ? '#f87171' : '#71717a' }}>{failCount} fail</span>
                </span>
              )}
              <div className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-600">
                <Clock className="w-2.5 h-2.5" />{elapsed(unit.updatedAt)}
                <ChevronDown className={`w-3.5 h-3.5 ml-0.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* ── Expanded: full test results + print ── */}
      {expanded && (
        <div className="border-t" style={{ borderColor: dividerColor }}>

          {/* Print PDF button */}
          <div className="px-4 pt-3 pb-2">
            <a href={`/print/qc/${unit.id}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}>
              <Printer className="w-3.5 h-3.5" /> Print PDF Report
            </a>
          </div>

          {/* Checklist results table */}
          {unit.checklistData ? (
            <div className="mx-4 mb-4 rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="grid grid-cols-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500"
                style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span>Test Item</span>
                <span className="text-center">Result</span>
                <span className="text-right">Value</span>
              </div>
              {QC_ITEMS.map((item, idx) => {
                const r       = unit.checklistData![item.key];
                const isPass  = r?.status === 'PASS';
                const isNA    = r?.status === 'NA' || r?.value === 'N/A';
                const isFItem = r?.status === 'FAIL';
                return (
                  <div key={item.key}
                    className={`grid grid-cols-3 items-center px-3 py-2 text-xs ${idx > 0 ? 'border-t' : ''}`}
                    style={idx > 0 ? { borderColor: 'rgba(255,255,255,0.04)' } : undefined}>
                    <span className="text-zinc-300 font-medium">{item.label}</span>
                    <span className="text-center">
                      {isNA ? (
                        <span className="text-zinc-600 text-[10px]">N/A</span>
                      ) : isPass ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ color: '#4ade80', background: 'rgba(34,197,94,0.12)' }}>
                          <Check className="w-2.5 h-2.5" /> PASS
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ color: '#f87171', background: 'rgba(239,68,68,0.12)' }}>
                          <X className="w-2.5 h-2.5" /> {isFItem ? 'FAIL' : '—'}
                        </span>
                      )}
                    </span>
                    <span className={`text-right font-mono text-xs ${isNA ? 'text-zinc-600' : isPass ? 'text-green-400' : 'text-red-400'}`}>
                      {r?.value || (isFItem ? 'FAIL' : '—')}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-zinc-600 text-xs italic px-4 pb-4">No checklist data recorded for this test</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-zinc-700 max-w-md mx-auto"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
        style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>
        <Check className="w-5 h-5 text-emerald-400" />
      </div>
      <p className="text-zinc-400 text-sm font-medium">{message}</p>
      <p className="text-zinc-600 text-xs mt-1">{sub}</p>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function QCWorkPanel({ role }: { role: string }) {
  const [activeUnits,    setActiveUnits]    = useState<QCUnit[]>([]);
  const [completedUnits, setCompletedUnits] = useState<CompletedUnit[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<QCUnit | null>(null);
  const [tab, setTab]             = useState<'pending' | 'processing' | 'completed'>('pending');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/qc/units');
      if (res.ok) {
        const data = await res.json() as { active: QCUnit[]; completed: CompletedUnit[] };
        setActiveUnits(data.active ?? []);
        setCompletedUnits(data.completed ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending    = activeUnits.filter((u) => u.currentStatus === 'PENDING' || u.currentStatus === 'REJECTED_BACK');
  const processing = activeUnits.filter((u) => u.currentStatus === 'IN_PROGRESS');

  // Unit detail view
  if (selected) {
    return (
      <div className="w-full px-4 pb-24 max-w-2xl mx-auto">
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
        <InlineQCChecklist unit={selected} onDone={() => { setSelected(null); load(); }} />
      </div>
    );
  }

  const tabUnits      = tab === 'pending' ? pending : processing;
  const showCompleted = tab === 'completed';

  // Tab definitions
  const tabs = [
    { key: 'pending'    as const, label: 'Pending',    count: pending.length        },
    { key: 'processing' as const, label: 'Processing', count: processing.length     },
    { key: 'completed'  as const, label: 'Completed',  count: completedUnits.length },
  ];

  return (
    <div className="w-full px-4 pb-24">
      {/* Header */}
      <div className="pt-6 pb-3 flex items-center justify-between max-w-4xl mx-auto">
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

      {/* Tabs — full-width style matching orders page */}
      <div className="flex gap-1 p-1 rounded-xl mb-5 max-w-4xl mx-auto"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === t.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}>
            {t.label}
            {t.count > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                style={{
                  background: tab === t.key ? 'rgba(14,165,233,0.2)' : 'rgba(255,255,255,0.06)',
                  color:      tab === t.key ? '#38bdf8'               : '#52525b',
                }}>
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
      ) : showCompleted ? (
        completedUnits.length === 0 ? (
          <EmptyState message="No completed QC this month" sub="Passed units will appear here" />
        ) : (
          <div className="flex flex-col gap-2 max-w-4xl mx-auto">
            {completedUnits.map((u) => (
              <CompletedCard key={u.id} unit={u} />
            ))}
          </div>
        )
      ) : tabUnits.length === 0 ? (
        <EmptyState
          message={tab === 'pending' ? 'No units pending QC' : 'Nothing in progress'}
          sub={tab === 'pending' ? 'All units have been picked up' : 'No active QC tests running'}
        />
      ) : (
        <div className="flex flex-col gap-2 max-w-4xl mx-auto">
          {groupByOrder(tabUnits).map((g) => (
            <OrderGroupAccordion key={g.orderId} group={g} onSelect={setSelected} />
          ))}
        </div>
      )}
    </div>
  );
}
