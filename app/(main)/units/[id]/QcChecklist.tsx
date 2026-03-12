'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

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

export function QcChecklist({
  unitId,
  currentStatus,
  serialNumber,
  productName,
  orderNumber,
  qcBarcode,
}: {
  unitId: string;
  currentStatus: string;
  serialNumber: string;
  productName: string;
  orderNumber: string;
  qcBarcode: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>(
    currentStatus === 'IN_PROGRESS' ? 'checklist' : 'idle'
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [checks, setChecks] = useState<Checks>({});
  const [inputValue, setInputValue] = useState('');
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [softwareVersion, setSoftwareVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<'PASS' | 'FAIL' | null>(null);

  // Assembly serial — tech must scan/type the unit serial to confirm identity before starting
  const [assemblySerial, setAssemblySerial] = useState('');
  const serialMatch = assemblySerial.trim().toUpperCase() === serialNumber.toUpperCase();

  const completedCount = QC_ITEMS.filter((i) => checks[i.key]).length;
  const currentItem = QC_ITEMS[currentIdx];

  // Auto-focus input when step changes
  useEffect(() => {
    if (phase === 'checklist') {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [phase, currentIdx]);

  // ── Start QC work ──────────────────────────────────────────────────────────
  async function startQC() {
    if (!assemblySerial.trim()) {
      setError('Scan or enter the controller serial number before starting.');
      return;
    }
    if (!serialMatch) {
      setError('Serial number does not match this unit. Please check the label and try again.');
      return;
    }
    setPhase('starting');
    setError(null);
    try {
      const res = await fetch(`/api/units/${unitId}/work`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to start QC');
      }
      setPhase('checklist');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error starting QC');
      setPhase('idle');
    }
  }

  // ── Mark current item ──────────────────────────────────────────────────────
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

  // ── Go back and re-do an item ──────────────────────────────────────────────
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

  // ── Print report (isolates print to report div) ────────────────────────────
  function printReport() {
    document.body.classList.add('print-qc');
    window.print();
    document.body.classList.remove('print-qc');
  }

  // ── Submit result to API ───────────────────────────────────────────────────
  async function submitResult(result: 'PASS' | 'FAIL') {
    setPhase('submitting');
    setError(null);
    try {
      const res = await fetch(`/api/units/${unitId}/qc`, {
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
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Submission failed');
      }
      setSubmittedResult(result);
      setPhase('done');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error submitting');
      setPhase('summary');
    }
  }

  const cardStyle = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 20,
  };

  return (
    <>
      {/* ── Screen UI ─────────────────────────────────────────────────────── */}

      {/* IDLE — Start QC */}
      {(phase === 'idle' || phase === 'starting') && (
        <div style={cardStyle}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-amber-400 mb-3">
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

          {/* ── Unit Identification ──────────────────────────────────────── */}
          <div
            className="rounded-xl p-3 mb-4"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
              Unit Identification — scan the serial label on the controller
            </p>
            <label className="block text-[11px] text-zinc-500 mb-1">
              Assembly Serial Number <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={assemblySerial}
              onChange={(e) => { setAssemblySerial(e.target.value.toUpperCase()); setError(null); }}
              placeholder={serialNumber}
              className="w-full px-3 py-2.5 rounded-lg text-sm font-mono text-white placeholder-zinc-700 outline-none"
              style={{
                background: serialMatch ? 'rgba(34,197,94,0.06)' : 'rgba(255,255,255,0.04)',
                border: serialMatch ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.1)',
              }}
            />
            {serialMatch && (
              <p className="text-green-400 text-[11px] mt-1.5">✓ Serial verified</p>
            )}
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <button
            onClick={startQC}
            disabled={phase === 'starting'}
            className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity"
            style={{
              background: 'rgba(14,165,233,0.15)',
              border: '1px solid rgba(14,165,233,0.3)',
              color: '#38bdf8',
            }}
          >
            {phase === 'starting' ? 'Starting…' : 'Start QC Test'}
          </button>
        </div>
      )}

      {/* CHECKLIST — Step by step */}
      {phase === 'checklist' && (
        <div style={cardStyle}>
          {/* Progress bar */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">
              {completedCount + 1} / {QC_ITEMS.length}
            </span>
            <span className="text-xs text-zinc-600">QC in progress</span>
          </div>
          <div
            className="h-1.5 rounded-full mb-5 overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(completedCount / QC_ITEMS.length) * 100}%`,
                background: '#38bdf8',
              }}
            />
          </div>

          {/* Current item */}
          <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Test Item</p>
          <p className="text-2xl font-bold text-white mb-4">{currentItem.label}</p>

          <label className="block text-xs text-zinc-500 mb-1.5">Measured Value</label>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') markCurrent('PASS');
            }}
            placeholder="Enter value…"
            className="w-full px-3 py-3 rounded-xl text-sm text-white placeholder-zinc-700 outline-none mb-3"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          />
          {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

          <div className="flex gap-2 mb-5">
            <button
              onClick={() => markCurrent('PASS')}
              className="flex-1 py-3 rounded-xl text-sm font-semibold"
              style={{
                background: 'rgba(34,197,94,0.15)',
                border: '1px solid rgba(34,197,94,0.3)',
                color: '#4ade80',
              }}
            >
              ✓ Pass
            </button>
            <button
              onClick={() => markCurrent('NA')}
              className="px-6 py-3 rounded-xl text-sm font-medium"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#71717a',
              }}
            >
              N/A
            </button>
          </div>

          {/* Completed items list */}
          {completedCount > 0 && (
            <div className="border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
                Completed
              </p>
              <ul className="space-y-2">
                {QC_ITEMS.slice(0, currentIdx).map((item, idx) => {
                  const check = checks[item.key];
                  if (!check) return null;
                  return (
                    <li key={item.key} className="flex items-center gap-2 text-sm">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          check.status === 'NA' ? 'bg-zinc-600' : 'bg-green-400'
                        }`}
                      />
                      <span className="text-zinc-400 flex-1">{item.label}</span>
                      <span
                        className={`text-xs font-mono ${
                          check.status === 'NA' ? 'text-zinc-600' : 'text-zinc-300'
                        }`}
                      >
                        {check.value}
                      </span>
                      <button
                        onClick={() => editItem(idx)}
                        className="text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors"
                      >
                        edit
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* SUMMARY — All done, review + act */}
      {(phase === 'summary' || phase === 'submitting') && (
        <div style={cardStyle}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-base text-white">All Tests Complete</h3>
            <span className="text-xs text-green-400 font-semibold">
              {QC_ITEMS.length} / {QC_ITEMS.length}
            </span>
          </div>

          {/* Results table */}
          <div
            className="rounded-xl overflow-hidden mb-4"
            style={{ border: '1px solid rgba(255,255,255,0.06)' }}
          >
            {QC_ITEMS.map((item, i) => {
              const check = checks[item.key];
              return (
                <div
                  key={item.key}
                  className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0"
                  style={{
                    borderColor: 'rgba(255,255,255,0.04)',
                    background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                  }}
                >
                  <span
                    className={`w-28 shrink-0 text-sm font-medium ${
                      check?.status === 'NA' ? 'text-zinc-500' : 'text-zinc-300'
                    }`}
                  >
                    {item.label}
                  </span>
                  <span
                    className={`flex-1 text-xs font-mono ${
                      check?.status === 'NA' ? 'text-zinc-600' : 'text-zinc-400'
                    }`}
                  >
                    {check?.value ?? '—'}
                  </span>
                  <button
                    onClick={() => editItem(i)}
                    className="text-[10px] text-zinc-700 hover:text-zinc-400 mr-2 transition-colors"
                  >
                    edit
                  </button>
                  <span
                    className={`text-[10px] font-bold uppercase w-8 text-right ${
                      check?.status === 'NA' ? 'text-zinc-600' : 'text-green-400'
                    }`}
                  >
                    {check?.status ?? '—'}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Firmware / Software */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
                Firmware
              </label>
              <input
                value={firmwareVersion}
                onChange={(e) => setFirmwareVersion(e.target.value)}
                placeholder="e.g. v1.2.3"
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-zinc-700 outline-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wide mb-1">
                Software
              </label>
              <input
                value={softwareVersion}
                onChange={(e) => setSoftwareVersion(e.target.value)}
                placeholder="e.g. v2.0.0"
                className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder-zinc-700 outline-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          {/* Action buttons */}
          <div className="space-y-2">
            <button
              onClick={printReport}
              className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-opacity hover:opacity-80"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#a1a1aa',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print / Save PDF
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => submitResult('PASS')}
                disabled={phase === 'submitting'}
                className="py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity"
                style={{
                  background: 'rgba(34,197,94,0.15)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  color: '#4ade80',
                }}
              >
                {phase === 'submitting' ? '…' : '✓ PASS'}
              </button>
              <button
                onClick={() => submitResult('FAIL')}
                disabled={phase === 'submitting'}
                className="py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity"
                style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  color: '#f87171',
                }}
              >
                {phase === 'submitting' ? '…' : '✗ REJECT'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DONE — Result card */}
      {phase === 'done' && submittedResult && (
        <div style={{ ...cardStyle, textAlign: 'center' }}>
          <div
            className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center text-2xl"
            style={{
              background:
                submittedResult === 'PASS'
                  ? 'rgba(34,197,94,0.15)'
                  : 'rgba(239,68,68,0.12)',
              border: `1px solid ${
                submittedResult === 'PASS'
                  ? 'rgba(34,197,94,0.3)'
                  : 'rgba(239,68,68,0.25)'
              }`,
            }}
          >
            {submittedResult === 'PASS' ? '✓' : '✗'}
          </div>
          <p
            className={`text-lg font-bold mb-1 ${
              submittedResult === 'PASS' ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {submittedResult === 'PASS' ? 'QC Passed' : 'Controller Rejected'}
          </p>
          <p className="text-zinc-500 text-sm mb-4">
            {submittedResult === 'PASS'
              ? 'Unit advanced to Final Assembly.'
              : 'Assigned back to Assembly team for rework.'}
          </p>
          <button
            onClick={printReport}
            className="w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#a1a1aa',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print QC Report
          </button>
        </div>
      )}

      {/* ── Print-only report (isolated by body.print-qc CSS) ──────────────── */}
      <div id="qc-print-report" style={{ display: 'none', fontFamily: 'Arial, sans-serif', color: '#111', fontSize: 11, lineHeight: 1.4 }}>

        {/* ── TOP HEADER BAR ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1e40af', paddingBottom: 10, marginBottom: 0 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, color: '#1e40af' }}>SMX DRIVES</div>
            <div style={{ fontSize: 10, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>Manufacturing Quality Control</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e3a8a', letterSpacing: 0.5 }}>QC TEST REPORT</div>
            <div style={{ fontSize: 9, color: '#666', marginTop: 3 }}>
              Doc Ref: {qcBarcode ?? serialNumber} &nbsp;|&nbsp; Rev: A
            </div>
            <div style={{ fontSize: 9, color: '#666', marginTop: 1 }}>
              Issued: {new Date().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* ── RESULT BANNER ──────────────────────────────────────────────── */}
        <div style={{
          margin: '10px 0',
          padding: '10px 16px',
          background: submittedResult === 'PASS' ? '#f0fdf4' : submittedResult === 'FAIL' ? '#fef2f2' : '#f8fafc',
          border: `2px solid ${submittedResult === 'PASS' ? '#16a34a' : submittedResult === 'FAIL' ? '#dc2626' : '#94a3b8'}`,
          borderRadius: 4,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#555', textTransform: 'uppercase' }}>Final QC Determination</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 2, color: submittedResult === 'PASS' ? '#15803d' : submittedResult === 'FAIL' ? '#b91c1c' : '#475569', letterSpacing: 1 }}>
              {submittedResult === 'PASS' ? '✓  PASSED — APPROVED FOR NEXT STAGE' : submittedResult === 'FAIL' ? '✗  REJECTED — RETURN TO REWORK' : 'PENDING'}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 9, color: '#666' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#333' }}>{serialNumber}</div>
            <div style={{ marginTop: 2 }}>Unit Serial</div>
          </div>
        </div>

        {/* ── UNIT TRACEABILITY ───────────────────────────────────────────── */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ background: '#1e3a8a', color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', padding: '4px 8px' }}>
            Unit Traceability
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <tbody>
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ padding: '5px 8px', fontWeight: 700, width: '18%', borderBottom: '1px solid #e2e8f0', color: '#374151' }}>Product</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0', width: '32%' }}>{productName}</td>
                <td style={{ padding: '5px 8px', fontWeight: 700, width: '18%', borderBottom: '1px solid #e2e8f0', color: '#374151' }}>Order No.</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #e2e8f0', fontFamily: 'monospace', width: '32%' }}>{orderNumber}</td>
              </tr>
              <tr>
                <td style={{ padding: '5px 8px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', color: '#374151' }}>Serial No.</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontWeight: 700, borderBottom: '1px solid #e2e8f0', color: '#1e40af' }}>{serialNumber}</td>
                <td style={{ padding: '5px 8px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', color: '#374151' }}>QC Barcode</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace', borderBottom: '1px solid #e2e8f0' }}>{qcBarcode ?? '—'}</td>
              </tr>
              <tr style={{ background: '#f8fafc' }}>
                <td style={{ padding: '5px 8px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', color: '#374151' }}>Firmware</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace', borderBottom: '1px solid #e2e8f0' }}>{firmwareVersion || '—'}</td>
                <td style={{ padding: '5px 8px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', color: '#374151' }}>Software</td>
                <td style={{ padding: '5px 8px', fontFamily: 'monospace', borderBottom: '1px solid #e2e8f0' }}>{softwareVersion || '—'}</td>
              </tr>
              <tr>
                <td style={{ padding: '5px 8px', fontWeight: 700, color: '#374151' }}>Test Date</td>
                <td style={{ padding: '5px 8px' }} colSpan={3}>{new Date().toLocaleString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── TEST RESULTS TABLE ──────────────────────────────────────────── */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ background: '#1e3a8a', color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', padding: '4px 8px' }}>
            Test Parameters &amp; Results
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#dbeafe' }}>
                <th style={{ padding: '5px 8px', textAlign: 'center', width: '6%', borderBottom: '2px solid #93c5fd', fontWeight: 700, color: '#1e40af' }}>No.</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', width: '34%', borderBottom: '2px solid #93c5fd', fontWeight: 700, color: '#1e40af' }}>Test Parameter</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', width: '40%', borderBottom: '2px solid #93c5fd', fontWeight: 700, color: '#1e40af' }}>Measured Value</th>
                <th style={{ padding: '5px 8px', textAlign: 'center', width: '20%', borderBottom: '2px solid #93c5fd', fontWeight: 700, color: '#1e40af' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {QC_ITEMS.map((item, i) => {
                const check = checks[item.key];
                const isNA = check?.status === 'NA';
                const isPass = check?.status === 'PASS';
                return (
                  <tr key={item.key} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '5px 8px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: '5px 8px', fontWeight: 600, color: '#1e293b' }}>{item.label}</td>
                    <td style={{ padding: '5px 8px', fontFamily: 'monospace', color: isNA ? '#94a3b8' : '#0f172a' }}>
                      {check?.value ?? '—'}
                    </td>
                    <td style={{
                      padding: '5px 8px',
                      textAlign: 'center',
                      fontWeight: 800,
                      fontSize: 10,
                      color: isNA ? '#94a3b8' : isPass ? '#15803d' : '#b91c1c',
                    }}>
                      {isNA ? 'N/A' : isPass ? '✓ PASS' : check?.status ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── SUMMARY ROW ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 11 }}>
          <div style={{ flex: 1, padding: '6px 10px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 3, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#15803d' }}>
              {QC_ITEMS.filter(i => checks[i.key]?.status === 'PASS').length}
            </div>
            <div style={{ fontSize: 9, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.5 }}>Passed</div>
          </div>
          <div style={{ flex: 1, padding: '6px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 3, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#475569' }}>
              {QC_ITEMS.filter(i => checks[i.key]?.status === 'NA').length}
            </div>
            <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>N/A</div>
          </div>
          <div style={{ flex: 1, padding: '6px 10px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 3, textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#b91c1c' }}>
              {QC_ITEMS.filter(i => checks[i.key] && checks[i.key]?.status !== 'PASS' && checks[i.key]?.status !== 'NA').length}
            </div>
            <div style={{ fontSize: 9, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Failed</div>
          </div>
          <div style={{ flex: 3, padding: '6px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 3 }}>
            <div style={{ fontSize: 9, color: '#92400e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Certification Statement</div>
            <div style={{ fontSize: 10, color: '#44403c', lineHeight: 1.5 }}>
              {submittedResult === 'PASS'
                ? 'This unit has been tested against all specified quality parameters and is certified compliant. It is approved to proceed to the next manufacturing stage.'
                : submittedResult === 'FAIL'
                ? 'This unit has failed one or more quality control parameters and is NOT approved to proceed. It must be returned to the Assembly team for rework before re-testing.'
                : 'QC result pending submission.'}
            </div>
          </div>
        </div>

        {/* ── SIGN-OFF SECTION ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
          {[
            { role: 'QC Technician', note: 'Performed the test' },
            { role: 'QA Supervisor', note: 'Reviewed & approved' },
          ].map(({ role, note }) => (
            <div key={role} style={{ flex: 1, border: '1px solid #cbd5e1', borderRadius: 3, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#1e3a8a', marginBottom: 6 }}>{role}</div>
              <div style={{ fontSize: 9, color: '#64748b', marginBottom: 12 }}>{note}</div>
              <div style={{ borderBottom: '1px solid #94a3b8', marginBottom: 4 }} />
              <div style={{ fontSize: 9, color: '#94a3b8' }}>Signature &amp; Date</div>
              <div style={{ marginTop: 8, borderBottom: '1px solid #94a3b8', marginBottom: 4 }} />
              <div style={{ fontSize: 9, color: '#94a3b8' }}>Name (Print)</div>
            </div>
          ))}
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────────────── */}
        <div style={{ borderTop: '2px solid #1e40af', paddingTop: 5, display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#64748b' }}>
          <span>SMX Drives Pvt. Ltd. — Proprietary &amp; Confidential</span>
          <span>Form: QCR-001 | Rev A | This document is valid only with authorised signatures</span>
          <span>Serial: {serialNumber}</span>
        </div>
      </div>
    </>
  );
}
