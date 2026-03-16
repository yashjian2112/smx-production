'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ClientOption = {
  id: string;
  code: string;
  customerName: string;
};

const TYPE_OPTIONS = [
  { value: 'WARRANTY',   label: 'Warranty' },
  { value: 'DAMAGE',     label: 'Damage' },
  { value: 'WRONG_ITEM', label: 'Wrong Item' },
  { value: 'OTHER',      label: 'Other' },
];

export default function ReturnForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();

  const [clientId,      setClientId]      = useState('');
  const [serialNumber,  setSerialNumber]  = useState('');
  const [type,          setType]          = useState('WARRANTY');
  const [reportedIssue, setReportedIssue] = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId)        { setError('Please select a client.'); return; }
    if (!reportedIssue.trim()) { setError('Please describe the reported issue.'); return; }

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/returns', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          clientId,
          serialNumber: serialNumber.trim() || undefined,
          type,
          reportedIssue: reportedIssue.trim(),
        }),
      });

      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Failed to create return request.');
        return;
      }

      router.push('/sales?tab=returns');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Client */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Client <span className="text-red-400">*</span>
        </label>
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
        >
          <option value="">Select client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.customerName} ({c.code})
            </option>
          ))}
        </select>
      </div>

      {/* Serial Number */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Serial Number <span className="text-zinc-500 font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={serialNumber}
          onChange={(e) => setSerialNumber(e.target.value)}
          placeholder="e.g. SMX100026001"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500"
        />
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Return Type <span className="text-red-400">*</span>
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          required
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Reported Issue */}
      <div>
        <label className="block text-sm font-medium text-zinc-300 mb-1">
          Reported Issue <span className="text-red-400">*</span>
        </label>
        <textarea
          value={reportedIssue}
          onChange={(e) => setReportedIssue(e.target.value)}
          required
          rows={4}
          placeholder="Describe the issue reported by the customer…"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div
          className="rounded-xl px-3 py-2.5 text-sm text-red-300"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
        >
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-colors"
          style={{ background: '#0ea5e9', color: '#fff' }}
        >
          {loading ? 'Submitting…' : 'Submit Return'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          disabled={loading}
          className="px-5 py-3 rounded-xl text-sm text-zinc-400 disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
