'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const STAGE_LABELS: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage',
  BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY: 'Assembly',
  QC_AND_SOFTWARE:     'QC & Software',
  REWORK:              'Rework',
  FINAL_ASSEMBLY:      'Final Assembly',
};

type FoundUnit = {
  id: string;
  serialNumber: string;
  currentStage: string;
  currentStatus: string;
};

export default function SerialPage() {
  const [query, setQuery]       = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [found, setFound]       = useState<FoundUnit | null>(null);
  const [countdown, setCountdown] = useState(5);
  const inputRef = useRef<HTMLInputElement>(null);
  const router   = useRouter();

  // Auto-focus on mount so barcode gun can scan immediately
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Countdown after unit is found — fires once per second, then navigates
  useEffect(() => {
    if (!found) return;

    if (countdown <= 0) {
      // Start work and navigate
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
    setError('');
    setLoading(true);
    try {
      // Try serial first, then barcode
      let res  = await fetch(`/api/units/by-serial/${encodeURIComponent(val)}`);
      let data = await res.json().catch(() => ({}));
      if (!res.ok) {
        res  = await fetch(`/api/units/by-barcode/${encodeURIComponent(val)}`);
        data = await res.json().catch(() => ({}));
      }

      if (res.ok && data?.id) {
        // Show serial + countdown before starting work
        setFound({
          id:            data.id,
          serialNumber:  data.serialNumber ?? val,
          currentStage:  data.currentStage ?? '',
          currentStatus: data.currentStatus ?? '',
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

  // ── FOUND state: serial + countdown ────────────────────────────────────────
  if (found) {
    const stageLabel  = STAGE_LABELS[found.currentStage] ?? found.currentStage.replace(/_/g, ' ');
    // SVG ring progress — 5 segments, one filled per second remaining
    const radius  = 52;
    const circ    = 2 * Math.PI * radius;
    const dash    = (countdown / 5) * circ;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 gap-8">

        {/* Confirmed badge */}
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-green-400"
          style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Unit Found
        </div>

        {/* Serial number — large, prominent */}
        <div className="text-center">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-widest mb-2">Serial Number</p>
          <p className="font-mono text-3xl font-bold text-white tracking-wider">{found.serialNumber}</p>
          <p className="text-zinc-500 text-sm mt-2">{stageLabel}</p>
        </div>

        {/* Circular countdown ring */}
        <div className="relative flex items-center justify-center">
          <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
            {/* Track */}
            <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
            {/* Progress */}
            <circle
              cx="64" cy="64" r={radius}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              style={{ transition: 'stroke-dasharray 0.9s linear' }}
            />
          </svg>
          {/* Countdown number */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-amber-400 font-mono tabular-nums">{countdown}</span>
          </div>
        </div>

        <p className="text-zinc-500 text-sm text-center">
          Work starts in <span className="text-amber-400 font-semibold">{countdown}s</span>
          <br />
          <span className="text-zinc-600 text-xs">Build time will begin automatically</span>
        </p>

      </div>
    );
  }

  // ── SCAN state ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 px-4">
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
          <line x1="6" y1="12" x2="18" y2="12" strokeDasharray="1 0" strokeWidth="0" />
        </svg>
      </div>

      {/* Heading */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-white">Scan Unit Barcode</h2>
        <p className="text-zinc-500 text-sm mt-2">
          Point your scanner at the unit barcode or type it below.
          <br />
          Build time starts automatically.
        </p>
      </div>

      {/* Scan input */}
      <form onSubmit={handleScan} className="w-full max-w-sm space-y-3">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value.toUpperCase()); setError(''); }}
            placeholder="SMX100026001 or barcode…"
            disabled={loading}
            className="w-full px-4 py-4 rounded-2xl font-mono text-lg text-white placeholder-zinc-600 focus:outline-none text-center tracking-widest disabled:opacity-50"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: error
                ? '2px solid rgba(239,68,68,0.6)'
                : '2px solid rgba(14,165,233,0.3)',
              fontSize: '1.1rem',
            }}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          {loading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="w-full py-4 rounded-2xl text-base font-bold transition-all disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', color: 'white' }}
        >
          {loading ? 'Looking up…' : 'Open Unit →'}
        </button>
      </form>

      {/* Hint */}
      <p className="text-zinc-700 text-xs text-center max-w-xs">
        Works with barcode guns, QR scanners, or manual entry.
        Accepts serial numbers and stage barcodes (PS, BB, QC).
      </p>
    </div>
  );
}
