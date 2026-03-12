'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Standard QC tests for SMX motor controller
const QC_TESTS = [
  { id: 't1',  label: 'Visual inspection — PCB, connectors, solder joints intact' },
  { id: 't2',  label: 'No physical damage, burnt marks, or loose components' },
  { id: 't3',  label: 'Input power cable connection verified' },
  { id: 't4',  label: 'Input voltage reading within spec' },
  { id: 't5',  label: 'Output phase voltages balanced (U / V / W)' },
  { id: 't6',  label: 'Firmware uploaded and version confirmed' },
  { id: 't7',  label: 'Software parameters configured and saved' },
  { id: 't8',  label: 'Motor communication test — no faults' },
  { id: 't9',  label: 'Encoder / resolver feedback verified' },
  { id: 't10', label: 'Overvoltage & overcurrent protection triggers correctly' },
  { id: 't11', label: 'Temperature sensor reading normal at idle' },
];

const SOURCE_STAGE_OPTIONS = [
  { value: '',                        label: '— Select root-cause stage —' },
  { value: 'POWERSTAGE_MANUFACTURING',  label: 'Powerstage Manufacturing' },
  { value: 'BRAINBOARD_MANUFACTURING',  label: 'Brainboard Manufacturing' },
  { value: 'CONTROLLER_ASSEMBLY',       label: 'Controller Assembly' },
  { value: 'QC_AND_SOFTWARE',           label: 'QC & Software' },
];

type Props = {
  unitId:        string;
  currentStatus: string;
  orderId:       string | null;
};

export function QcChecklist({ unitId, currentStatus, orderId }: Props) {
  const router = useRouter();

  // 'pending'    → show "Start QC Test" button
  // 'running'    → show checklist + form
  // 'submitting' → spinner
  // 'done'       → result screen
  const [phase, setPhase]   = useState<'pending' | 'running' | 'submitting' | 'done'>(
    currentStatus === 'IN_PROGRESS' ? 'running' : 'pending',
  );

  const [startLoading, setStartLoading] = useState(false);
  const [checked, setChecked]           = useState<Record<string, boolean>>({});
  const [firmwareVer, setFirmwareVer]   = useState('');
  const [softwareVer, setSoftwareVer]   = useState('');
  const [remarks, setRemarks]           = useState('');
  const [sourceStage, setSourceStage]   = useState('');
  const [error, setError]               = useState('');
  const [finalResult, setFinalResult]   = useState<'PASS' | 'FAIL' | null>(null);

  const allChecked = QC_TESTS.every((t) => checked[t.id]);

  // Pre-fill firmware/software version from existing unit data
  useEffect(() => {
    fetch(`/api/units/${unitId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.firmwareVersion) setFirmwareVer(d.firmwareVersion);
        if (d.softwareVersion) setSoftwareVer(d.softwareVersion);
      })
      .catch(() => {});
  }, [unitId]);

  async function startTest() {
    setStartLoading(true);
    setError('');
    try {
      const res  = await fetch(`/api/units/${unitId}/work`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data?.id) {
        setPhase('running');
      } else {
        setError(data?.error ?? 'Failed to start QC test. Please try again.');
      }
    } catch {
      setError('Network error — please try again.');
    } finally {
      setStartLoading(false);
    }
  }

  async function submitQC(result: 'PASS' | 'FAIL') {
    if (!allChecked) {
      setError('Please complete all checklist tests before submitting.');
      return;
    }
    if (result === 'FAIL' && !sourceStage) {
      setError('Please select the root-cause stage for the failure.');
      return;
    }

    setPhase('submitting');
    setError('');
    try {
      const res = await fetch(`/api/units/${unitId}/qc`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          result,
          sourceStage:     result === 'FAIL' ? sourceStage : undefined,
          remarks:         remarks || undefined,
          firmwareVersion: firmwareVer || undefined,
          softwareVersion: softwareVer || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFinalResult(result);
        setPhase('done');
      } else {
        setError(data?.error ?? `Submission failed (${res.status})`);
        setPhase('running');
      }
    } catch {
      setError('Network error — please try again.');
      setPhase('running');
    }
  }

  // ── Done screen ────────────────────────────────────────────────────────────
  if (phase === 'done') {
    const passed = finalResult === 'PASS';
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
          style={{ background: passed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }}
        >
          {passed ? '✓' : '✗'}
        </div>
        <p className={`text-xl font-bold ${passed ? 'text-green-400' : 'text-red-400'}`}>
          QC {passed ? 'Passed' : 'Failed'}
        </p>
        <p className="text-zinc-500 text-sm text-center">
          {passed
            ? 'Unit advanced to Final Assembly. Print the QC report below.'
            : 'Unit is blocked for rework. A manager will assign the rework task.'}
        </p>
        <div className="flex gap-3 flex-wrap justify-center mt-2">
          <button
            type="button"
            onClick={() => router.push(`/print/qc/${unitId}`)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}
          >
            Print QC Report
          </button>
          <button
            type="button"
            onClick={() => router.push(orderId ? `/orders/${orderId}` : '/orders')}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#a1a1aa' }}
          >
            Back to Order
          </button>
        </div>
      </div>
    );
  }

  // ── Pending: Start QC Test ─────────────────────────────────────────────────
  if (phase === 'pending') {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.25)' }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.8" strokeLinecap="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-sky-400">QC &amp; Software Test</p>
        <p className="text-xs text-zinc-500 text-center max-w-xs">
          Run through all {QC_TESTS.length} checks, record firmware &amp; software versions, then mark PASS or FAIL.
        </p>
        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}
        <button
          type="button"
          onClick={startTest}
          disabled={startLoading}
          className="mt-2 px-6 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
          style={{ background: 'rgba(14,165,233,0.18)', border: '1px solid rgba(14,165,233,0.35)', color: '#38bdf8' }}
        >
          {startLoading ? 'Starting…' : 'Start QC Test'}
        </button>
      </div>
    );
  }

  // ── Running: checklist + form ──────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Test checklist */}
      <div>
        <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
          Tests — {Object.values(checked).filter(Boolean).length}/{QC_TESTS.length} done
        </p>
        <ul className="space-y-2">
          {QC_TESTS.map((t) => (
            <li key={t.id}>
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!checked[t.id]}
                  onChange={(e) => setChecked((prev) => ({ ...prev, [t.id]: e.target.checked }))}
                  className="mt-0.5 shrink-0 accent-sky-400 w-4 h-4"
                />
                <span className={`text-sm leading-snug ${checked[t.id] ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                  {t.label}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {/* Versions */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">Firmware Version</label>
          <input
            type="text"
            value={firmwareVer}
            onChange={(e) => setFirmwareVer(e.target.value)}
            placeholder="e.g. 2.4.1"
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7' }}
          />
        </div>
        <div>
          <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">Software Version</label>
          <input
            type="text"
            value={softwareVer}
            onChange={(e) => setSoftwareVer(e.target.value)}
            placeholder="e.g. 1.9.0"
            className="w-full px-3 py-2 rounded-lg text-sm font-mono"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7' }}
          />
        </div>
      </div>

      {/* Failure details — shown always so tech can pre-fill before tapping FAIL */}
      <div>
        <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">
          Remarks (optional for PASS, required for FAIL)
        </label>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={2}
          placeholder="Describe any issues found…"
          className="w-full px-3 py-2 rounded-lg text-sm resize-none"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7' }}
        />
      </div>
      <div>
        <label className="block text-[11px] text-zinc-500 mb-1 uppercase tracking-wide">
          Root-cause Stage (required for FAIL)
        </label>
        <select
          value={sourceStage}
          onChange={(e) => setSourceStage(e.target.value)}
          className="w-full px-3 py-2 rounded-lg text-sm"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: '#e4e4e7' }}
        >
          {SOURCE_STAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} style={{ background: '#18181b' }}>{o.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          disabled={!allChecked || phase === 'submitting'}
          onClick={() => submitQC('PASS')}
          className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-40"
          style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }}
        >
          {phase === 'submitting' ? 'Saving…' : '✓ Pass'}
        </button>
        <button
          type="button"
          disabled={!allChecked || phase === 'submitting'}
          onClick={() => submitQC('FAIL')}
          className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-40"
          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
        >
          {phase === 'submitting' ? 'Saving…' : '✗ Fail'}
        </button>
      </div>

      {!allChecked && (
        <p className="text-[11px] text-zinc-600 text-center">
          Complete all {QC_TESTS.length} tests above to enable Pass / Fail buttons.
        </p>
      )}
    </div>
  );
}
