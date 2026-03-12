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
      <div id="qc-print-report" style={{ display: 'none' }}>
        {/* Header */}
        <div
          style={{
            borderBottom: '2px solid #111',
            paddingBottom: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 'bold', margin: 0 }}>
                SMX Drives — QC Test Report
              </h1>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#444' }}>
                {productName} · Order {orderNumber}
              </p>
            </div>
            <div style={{ textAlign: 'right', fontSize: 11, color: '#555' }}>
              <p style={{ margin: 0 }}>Date: {new Date().toLocaleString('en-IN')}</p>
              {qcBarcode && <p style={{ margin: '2px 0 0' }}>QC Code: {qcBarcode}</p>}
            </div>
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 24, fontSize: 13 }}>
            <div>
              <span style={{ color: '#666' }}>Serial: </span>
              <strong>{serialNumber}</strong>
            </div>
            {firmwareVersion && (
              <div>
                <span style={{ color: '#666' }}>FW: </span>
                <strong>{firmwareVersion}</strong>
              </div>
            )}
            {softwareVersion && (
              <div>
                <span style={{ color: '#666' }}>SW: </span>
                <strong>{softwareVersion}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Checklist table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #888', background: '#f5f5f5' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', width: '40%' }}>Test</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', width: '40%' }}>Value</th>
              <th style={{ textAlign: 'center', padding: '6px 10px', width: '20%' }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {QC_ITEMS.map((item, i) => {
              const check = checks[item.key];
              return (
                <tr
                  key={item.key}
                  style={{
                    borderBottom: '1px solid #ddd',
                    background: i % 2 === 0 ? '#fafafa' : '#fff',
                  }}
                >
                  <td style={{ padding: '6px 10px', fontWeight: 500 }}>{item.label}</td>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#333' }}>
                    {check?.value ?? '—'}
                  </td>
                  <td
                    style={{
                      padding: '6px 10px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      color:
                        check?.status === 'PASS'
                          ? '#16a34a'
                          : check?.status === 'NA'
                          ? '#888'
                          : '#111',
                    }}
                  >
                    {check?.status ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Overall result */}
        <div
          style={{
            marginTop: 20,
            padding: '10px 14px',
            border: '2px solid #111',
            borderRadius: 4,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 'bold' }}>Overall Result</span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 'bold',
              color:
                submittedResult === 'PASS'
                  ? '#16a34a'
                  : submittedResult === 'FAIL'
                  ? '#dc2626'
                  : '#111',
            }}
          >
            {submittedResult === 'PASS'
              ? '✓ PASS'
              : submittedResult === 'FAIL'
              ? '✗ REJECTED'
              : 'PENDING'}
          </span>
        </div>

        {/* Signature row */}
        <div
          style={{
            marginTop: 32,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#666',
          }}
        >
          <div>
            QC Technician: ___________________________
          </div>
          <div>
            Signature: ___________________________
          </div>
        </div>
      </div>
    </>
  );
}
