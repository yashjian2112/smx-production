'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ScanInput } from '@/components/ScanInput';

const STAGE_LABELS: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage',
  BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY:      'Assembly',
  QC_AND_SOFTWARE:          'QC & Software',
  REWORK:                   'Rework',
  FINAL_ASSEMBLY:           'Final Assembly',
};

type ActiveWork = {
  id:        string;
  startedAt: string;
  stage:     string;
  unit: {
    id:            string;
    serialNumber:  string;
    currentStage:  string;
    currentStatus: string;
    product:       { name: string; code: string } | null;
    order:         { orderNumber: string } | null;
  };
};

type FoundUnit = {
  id:            string;
  serialNumber:  string;
  currentStage:  string;
  currentStatus: string;
};

// Live elapsed timer (e.g. "4m 32s")
function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const tick  = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return <span className="font-mono tabular-nums">{m > 0 ? `${m}m ${s}s` : `${s}s`}</span>;
}

export default function SerialPage() {
  const [query,      setQuery]      = useState('');
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [found,      setFound]      = useState<FoundUnit | null>(null);
  const [countdown,  setCountdown]  = useState(5);
  const [activeWork, setActiveWork] = useState<ActiveWork | null>(null);
  const [workLoading, setWorkLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const router   = useRouter();

  // Auto-focus on mount (only when no active work)
  useEffect(() => { if (!activeWork) inputRef.current?.focus(); }, [activeWork]);

  // Check for active work session on mount
  useEffect(() => {
    fetch('/api/work/active')
      .then(r => r.json())
      .then(data => { setActiveWork(data.active ?? null); })
      .catch(() => {})
      .finally(() => setWorkLoading(false));
  }, []);

  // Countdown after unit is found — fires every second, then starts work + navigates
  useEffect(() => {
    if (!found) return;
    if (countdown <= 0) {
      fetch(`/api/units/${found.id}/work`, { method: 'POST' }).catch(() => {});
      router.push(`/units/${found.id}`);
      return;
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [found, countdown, router]);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const val = query.trim().toUpperCase();
    if (!val) return;
    // Component barcodes (COMP-…) are for board identification during Assembly — not valid here
    if (val.startsWith('COMP-')) {
      setError('Component barcodes are not valid here. Scan the unit serial or stage barcode (PS / BB / QC / FA).');
      setQuery('');
      inputRef.current?.focus();
      return;
    }
    setError('');
    setLoading(true);
    try {
      let res  = await fetch(`/api/units/by-serial/${encodeURIComponent(val)}`);
      let data = await res.json().catch(() => ({}));
      if (!res.ok) {
        res  = await fetch(`/api/units/by-barcode/${encodeURIComponent(val)}`);
        data = await res.json().catch(() => ({}));
      }
      if (res.ok && data?.id) {
        const status = data.currentStatus ?? '';

        // ── Status guards ──────────────────────────────────────────────────
        if (status === 'COMPLETED') {
          setError('This unit has already completed its current stage.');
          setQuery(''); inputRef.current?.focus(); return;
        }
        if (status === 'BLOCKED') {
          setError('This unit failed QC — contact your manager before proceeding.');
          setQuery(''); inputRef.current?.focus(); return;
        }
        if (status === 'WAITING_APPROVAL') {
          setError('This unit is waiting for manager approval.');
          setQuery(''); inputRef.current?.focus(); return;
        }
        setFound({
          id:            data.id,
          serialNumber:  data.serialNumber ?? val,
          currentStage:  data.currentStage ?? '',
          currentStatus: status,
        });
        setCountdown(5);
      } else {
        setError(data?.error || 'No unit found with that barcode. Try again.');
        setQuery('');
        inputRef.current?.focus();
      }
    } catch {
      setError('Network error. Please try again.');
      setQuery('');
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  // ── FOUND: serial confirmation + countdown ─────────────────────────────────
  if (found) {
    const stageLabel = STAGE_LABELS[found.currentStage] ?? found.currentStage.replace(/_/g, ' ');
    const radius = 52;
    const circ   = 2 * Math.PI * radius;
    const dash   = (countdown / 5) * circ;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-8">
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-green-400"
          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Unit Found
        </div>

        <div className="text-center">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest mb-2">Serial Number</p>
          <p className="font-mono text-3xl font-bold text-white tracking-wider">{found.serialNumber}</p>
          <p className="text-zinc-500 text-sm mt-2">{stageLabel}</p>
        </div>

        {/* Circular countdown */}
        <div className="relative flex items-center justify-center">
          <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
            <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
            <circle
              cx="64" cy="64" r={radius}
              fill="none" stroke="#f59e0b" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              style={{ transition: 'stroke-dasharray 0.9s linear' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-amber-400 font-mono tabular-nums">{countdown}</span>
          </div>
        </div>

        <p className="text-zinc-500 text-sm text-center">
          Work starts in <span className="text-amber-400 font-semibold">{countdown}s</span>
          <br /><span className="text-zinc-600 text-xs">Build time will begin automatically</span>
        </p>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (workLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Employee already has active work → MUST finish it first ───────────────
  if (activeWork) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-6">

        {/* Lock banner */}
        <div
          className="w-full max-w-sm rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <p className="text-red-400 text-sm font-medium">One unit at a time — finish your current unit first.</p>
        </div>

        {/* Resume card */}
        <button
          type="button"
          onClick={() => router.push(`/units/${activeWork.unit.id}`)}
          className="w-full max-w-sm rounded-2xl p-4 text-left"
          style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">Work In Progress</span>
            </div>
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full text-amber-300"
              style={{ background: 'rgba(251,191,36,0.15)' }}
            >
              <ElapsedTimer startedAt={activeWork.startedAt} />
            </span>
          </div>

          <p className="font-mono text-xl font-bold text-white tracking-wider">
            {activeWork.unit.serialNumber}
          </p>
          <p className="text-zinc-400 text-sm mt-0.5">
            {activeWork.unit.product?.name ?? ''}
            {activeWork.unit.order ? ` · ${activeWork.unit.order.orderNumber}` : ''}
          </p>

          <div className="flex items-center gap-2 mt-3">
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium text-sky-300"
              style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.2)' }}
            >
              {STAGE_LABELS[activeWork.unit.currentStage] ?? activeWork.unit.currentStage}
            </span>
            <span className="text-zinc-500 text-xs">Tap to continue →</span>
          </div>
        </button>

        <p className="text-zinc-600 text-xs text-center max-w-xs">
          Complete and submit your photo to unlock scanning a new unit.
        </p>
      </div>
    );
  }

  // ── SCAN page (no active work) ─────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 px-4">

      {/* Icon */}
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)' }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(56,189,248,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          <line x1="7" y1="9" x2="7" y2="15" />
          <line x1="10" y1="9" x2="10" y2="15" />
          <line x1="13" y1="9" x2="13" y2="15" />
          <line x1="16" y1="9" x2="16" y2="15" />
        </svg>
      </div>

      <div className="text-center">
        <h2 className="text-xl font-bold text-white">Scan Unit Barcode</h2>
        <p className="text-zinc-500 text-sm mt-1">Point your scanner at the stage barcode or type it below.</p>
      </div>

      {/* Scan input */}
      <form onSubmit={handleScan} className="w-full max-w-sm space-y-3">
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: error ? '2px solid rgba(239,68,68,0.6)' : '2px solid rgba(14,165,233,0.3)',
          }}>
          <ScanInput
            value={query}
            onChange={(v) => { setQuery(v.toUpperCase()); setError(''); }}
            onScan={(code) => { setQuery(code.toUpperCase()); setError(''); setTimeout(() => handleScan({ preventDefault: () => {} } as React.FormEvent), 50); }}
            placeholder="Scan serial or stage barcode…"
            autoFocus
            disabled={loading}
            scannerTitle="Scan Unit Barcode"
            scannerHint="Scan serial number or stage barcode (PS / BB / QC / FA)"
            className="font-mono text-lg tracking-widest text-center"
          />
          {loading && <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin shrink-0" />}
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="w-full py-4 rounded-2xl text-base font-bold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', color: 'white' }}
        >
          {loading ? 'Looking up…' : 'Start Work →'}
        </button>
      </form>

      <p className="text-zinc-700 text-xs text-center max-w-xs">
        Accepts serial numbers and stage barcodes (PS, BB, QC, FA).
      </p>
    </div>
  );
}
