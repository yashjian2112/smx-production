'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SerialPage() {
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Auto-focus on mount so barcode gun can scan immediately
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const val = query.trim().toUpperCase();
    if (!val) return;
    setError('');
    setLoading(true);
    try {
      // Try serial first, then barcode
      let res = await fetch(`/api/units/by-serial/${encodeURIComponent(val)}`);
      let data = await res.json().catch(() => ({}));
      if (!res.ok) {
        res = await fetch(`/api/units/by-barcode/${encodeURIComponent(val)}`);
        data = await res.json().catch(() => ({}));
      }
      if (res.ok && data?.id) {
        // Auto-start work so the unit page lands straight on "Open Work"
        fetch(`/api/units/${data.id}/work`, { method: 'POST' }).catch(() => {});
        router.push(`/units/${data.id}`);
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
          You'll go straight to the work page.
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
          style={{
            background: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
            color: 'white',
          }}
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
