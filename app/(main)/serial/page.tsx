'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function SerialPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ unit?: { id: string; serialNumber: string }; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setResult(null);
    setLoading(true);
    try {
      const trimmed = query.trim().toUpperCase();
      let res = await fetch(`/api/units/by-serial/${encodeURIComponent(trimmed)}`);
      let data = await res.json().catch(() => ({}));
      if (!res.ok) {
        res = await fetch(`/api/units/by-barcode/${encodeURIComponent(trimmed)}`);
        data = await res.json().catch(() => ({}));
      }
      if (res.ok) setResult({ unit: { id: data.id, serialNumber: data.serialNumber } });
      else setResult({ error: 'Not found' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Serial / Barcode Master</h2>
      <p className="text-slate-400 text-sm">Search by serial (SMX100026001) or any stage barcode to open controller passport. No printable BOM sheet.</p>
      <form onSubmit={search} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          placeholder="Serial or barcode (e.g. 1000PS26001)"
          className="flex-1 px-4 py-3 rounded-lg bg-smx-surface border border-slate-600 font-mono text-lg placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <button type="submit" disabled={loading} className="px-6 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 font-medium tap-target disabled:opacity-50">
          {loading ? '…' : 'Search'}
        </button>
      </form>
      {result?.error && <p className="text-red-400">Controller not found.</p>}
      {result?.unit && (
        <Link
          href={`/units/${result.unit.id}`}
          className="block p-4 rounded-xl bg-smx-surface border border-sky-500 text-sky-400 font-mono text-lg"
        >
          Open {result.unit.serialNumber} →
        </Link>
      )}
    </div>
  );
}
