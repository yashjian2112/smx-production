'use client';

import { useState, useEffect } from 'react';

type RFQItem = {
  id: string; materialId: string; qtyRequired: number;
  material: { id: string; name: string; code: string; unit: string };
};
type RFQ = {
  id: string; rfqNumber: string; title: string; description?: string;
  fileUrls: string[]; deadline?: string; status: string;
  items: RFQItem[];
};

export default function VendorPortal({ token }: { token: string }) {
  const [rfq, setRFQ] = useState<RFQ | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  // Quote form state
  const [currency, setCurrency] = useState('INR');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/vendor-portal/rfq?token=${token}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'Invalid link');
        return r.json();
      })
      .then((data: RFQ[] & { myQuote?: { status: string } }) => {
        const first = Array.isArray(data) ? data[0] : data;
        if (!first) throw new Error('RFQ not found');
        setRFQ(first);
        // Check if already submitted
        if ((first as any).myQuote) {
          setAlreadySubmitted(true);
        }
        // Init item prices
        const init: Record<string, string> = {};
        first.items.forEach((i: RFQItem) => { init[i.id] = ''; });
        setItemPrices(init);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      if (r.ok) { const d = await r.json(); setFileUrls(prev => [...prev, d.url]); }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rfq) return;
    if (!leadTimeDays || !validUntil) return alert('Fill all required fields');
    const items = rfq.items.map(i => ({
      rfqItemId: i.id,
      materialId: i.materialId,
      unitPrice: parseFloat(itemPrices[i.id] ?? '0') || 0,
      qty: i.qtyRequired,
    }));
    if (items.some(i => i.unitPrice <= 0)) return alert('Enter price for all items');
    const totalAmount = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);

    setSubmitting(true);
    try {
      const r = await fetch(`/api/procurement/rfq/${rfq.id}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, currency, leadTimeDays: parseInt(leadTimeDays), validUntil, notes, fileUrls, items }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Submission failed');
      setSubmitted(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'rgb(9,9,11)' }}>
        <div className="text-zinc-400 text-sm">Loading…</div>
      </div>
    );
  }

  if (error || !rfq) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'rgb(9,9,11)' }}>
        <div className="text-center space-y-3 max-w-sm px-6">
          <div className="text-4xl">⚠️</div>
          <p className="text-white font-medium text-lg">{error || 'Invalid link'}</p>
          <p className="text-zinc-500 text-sm">This RFQ link is invalid or has expired. Contact your purchase manager for assistance.</p>
        </div>
      </div>
    );
  }

  const isExpired = rfq.deadline ? new Date(rfq.deadline) < new Date() : false;
  const isClosed = rfq.status === 'CLOSED' || rfq.status === 'CONVERTED' || rfq.status === 'CANCELLED';

  return (
    <div className="min-h-screen pb-16" style={{ background: 'rgb(9,9,11)' }}>
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-lg">SMX Drives</p>
            <p className="text-zinc-500 text-xs">Vendor RFQ Portal</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">{rfq.rfqNumber}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
        {/* RFQ Details */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-white font-semibold text-base mb-1">{rfq.title}</p>
          {rfq.description && <p className="text-zinc-400 text-sm mb-3">{rfq.description}</p>}
          {rfq.deadline && (
            <p className={`text-sm mb-3 ${isExpired ? 'text-red-400' : 'text-yellow-400'}`}>
              {isExpired ? '⛔ Deadline Passed: ' : '⏰ Deadline: '}
              {new Date(rfq.deadline).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {/* Files */}
          {rfq.fileUrls.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-1">Drawings & Specs</p>
              {rfq.fileUrls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-400 text-sm hover:underline">
                  📎 {u.split('/').pop() ?? `File ${i + 1}`}
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Materials Required */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Materials Required</p>
          <div className="space-y-2">
            {rfq.items.map(item => (
              <div key={item.id} className="flex justify-between text-sm">
                <div>
                  <span className="text-zinc-200">{item.material.name}</span>
                  <span className="text-zinc-500 ml-2 text-xs">{item.material.code}</span>
                </div>
                <span className="text-zinc-400">{item.qtyRequired} {item.material.unit}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Success */}
        {submitted && (
          <div className="rounded-xl border border-emerald-700 bg-emerald-900/20 p-4">
            <p className="text-emerald-400 font-medium">✓ Quote submitted successfully!</p>
            <p className="text-emerald-300/70 text-xs mt-1">The purchase team will review your quote and contact you if selected.</p>
          </div>
        )}

        {/* Already submitted */}
        {alreadySubmitted && !submitted && (
          <div className="rounded-xl border border-blue-800 bg-blue-900/20 p-4">
            <p className="text-blue-400 font-medium">Quote already submitted for this RFQ.</p>
            <p className="text-blue-300/70 text-xs mt-1">Contact the purchase manager to update your quote.</p>
          </div>
        )}

        {/* Quote Form */}
        {!submitted && !alreadySubmitted && !isClosed && !isExpired && (
          <form onSubmit={submit} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
            <p className="text-white font-medium">Submit Your Quote</p>

            {/* Currency */}
            <div>
              <label className="text-xs text-zinc-400">Currency *</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none">
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>

            {/* Per-item pricing */}
            <div>
              <label className="text-xs text-zinc-400 font-medium">Price per Item *</label>
              <div className="space-y-2 mt-2">
                {rfq.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-zinc-300">{item.material.name} <span className="text-zinc-500">× {item.qtyRequired} {item.material.unit}</span></span>
                    <div className="flex items-center gap-1">
                      <span className="text-zinc-500 text-sm">{currency === 'USD' ? '$' : '₹'}</span>
                      <input type="number" min={0} step="0.01" placeholder="0.00"
                        value={itemPrices[item.id] ?? ''}
                        onChange={e => setItemPrices(p => ({ ...p, [item.id]: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className="w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm text-right focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>
                ))}
                {/* Total */}
                <div className="flex justify-between pt-2 border-t border-zinc-700 text-sm font-medium">
                  <span className="text-zinc-400">Total Quote</span>
                  <span className="text-white">
                    {currency === 'USD' ? '$' : '₹'}{rfq.items.reduce((s, i) => s + (parseFloat(itemPrices[i.id] ?? '0') || 0) * i.qtyRequired, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400">Lead Time (days) *</label>
                <input type="number" required min={1} value={leadTimeDays}
                  onChange={e => setLeadTimeDays(e.target.value)}
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  placeholder="e.g. 7"
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Quote Valid Until *</label>
                <input type="date" required value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Notes / Terms (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Payment terms, warranty, delivery conditions..."
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-blue-500" />
            </div>

            {/* Attachment */}
            <div>
              <label className="text-xs text-zinc-400">Attach Quotation PDF (optional)</label>
              <input type="file" accept=".pdf,.jpg,.png" onChange={handleFileUpload}
                className="w-full mt-1 text-zinc-400 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-zinc-700 file:text-white hover:file:bg-zinc-600" />
              {fileUrls.length > 0 && <p className="text-xs text-blue-400 mt-1">✓ {fileUrls.length} file uploaded</p>}
            </div>

            <button type="submit" disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-colors">
              {submitting ? 'Submitting…' : 'Submit Quote'}
            </button>

            <p className="text-xs text-zinc-500 text-center">
              All quotes are confidential and reviewed fairly by the purchase team.
            </p>
          </form>
        )}

        {(isClosed || isExpired) && !submitted && !alreadySubmitted && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-4 text-center">
            <p className="text-zinc-400 text-sm">{isExpired ? 'This RFQ deadline has passed.' : 'This RFQ is closed.'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
