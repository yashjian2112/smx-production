'use client';

import { useState, useEffect } from 'react';

type PortalData = {
  id:     string;
  status: string;
  deadline: string;
  isExpired: boolean;
  vendor: { name: string; code: string };
  purchaseRequest: {
    requestNumber:    string;
    rawMaterialName:  string;
    rawMaterialUnit:  string;
    quantityRequired: number;
    unit:             string;
    urgency:          string;
    notes?:           string;
  };
  existingBid: {
    pricePerUnit: number; totalAmount: number; leadTimeDays: number;
    validUntil: string; notes?: string; status: string; submittedAt: string;
  } | null;
};

export default function VendorPortal({ token }: { token: string }) {
  const [data, setData]       = useState<PortalData | null>(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);

  // Form state
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [validUntil, setValidUntil]     = useState('');
  const [notes, setNotes]               = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [submitted, setSubmitted]       = useState(false);

  useEffect(() => {
    fetch(`/api/vendor-portal/${token}`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json()).error || 'Invalid link');
        return r.json();
      })
      .then((d: PortalData) => {
        setData(d);
        if (d.existingBid) {
          setPricePerUnit(String(d.existingBid.pricePerUnit));
          setLeadTimeDays(String(d.existingBid.leadTimeDays));
          setValidUntil(d.existingBid.validUntil.split('T')[0]);
          setNotes(d.existingBid.notes || '');
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pricePerUnit || !leadTimeDays || !validUntil) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/vendor-portal/${token}/bid`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          pricePerUnit: parseFloat(pricePerUnit),
          leadTimeDays: parseInt(leadTimeDays, 10),
          validUntil,
          notes,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Submission failed');
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed');
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

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'rgb(9,9,11)' }}>
        <div className="text-center space-y-3 max-w-sm px-6">
          <div className="text-4xl">⚠️</div>
          <p className="text-white font-medium text-lg">{error || 'Invalid link'}</p>
          <p className="text-zinc-500 text-sm">This bid invitation link is invalid or has expired. Contact your purchase manager for assistance.</p>
        </div>
      </div>
    );
  }

  const deadlineDate = new Date(data.deadline);
  const pr = data.purchaseRequest;

  return (
    <div className="min-h-screen pb-16" style={{ background: 'rgb(9,9,11)' }}>
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-lg">SMX Drives</p>
            <p className="text-zinc-500 text-xs">Vendor Bid Portal</p>
          </div>
          <div className="text-right">
            <p className="text-zinc-300 text-sm font-medium">{data.vendor.name}</p>
            <p className="text-zinc-500 text-xs">{data.vendor.code}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        {/* Request details */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Purchase Request</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-zinc-500 text-xs">Reference</p>
              <p className="text-white font-medium">{pr.requestNumber}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Urgency</p>
              <p className={`font-medium ${
                pr.urgency === 'CRITICAL' ? 'text-red-400' :
                pr.urgency === 'HIGH'     ? 'text-orange-400' :
                pr.urgency === 'MEDIUM'   ? 'text-yellow-400' : 'text-zinc-400'}`}>
                {pr.urgency}
              </p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Material Required</p>
              <p className="text-white">{pr.rawMaterialName}</p>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Quantity</p>
              <p className="text-white font-medium">{pr.quantityRequired} {pr.unit}</p>
            </div>
          </div>
          {pr.notes && (
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-zinc-500 text-xs mb-1">Notes from purchase team</p>
              <p className="text-zinc-300 text-sm">{pr.notes}</p>
            </div>
          )}
        </div>

        {/* Deadline */}
        <div className={`rounded-xl border p-4 ${
          data.isExpired
            ? 'border-red-800 bg-red-900/20'
            : 'border-yellow-800 bg-yellow-900/10'}`}>
          <p className={`text-sm font-medium ${data.isExpired ? 'text-red-400' : 'text-yellow-400'}`}>
            {data.isExpired ? '⛔ Deadline Passed' : '⏰ Bid Deadline'}
          </p>
          <p className={`text-base font-bold mt-1 ${data.isExpired ? 'text-red-300' : 'text-white'}`}>
            {deadlineDate.toLocaleString('en-IN', {
              day: '2-digit', month: 'long', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>

        {/* Already selected */}
        {data.existingBid?.status === 'SELECTED' && (
          <div className="rounded-xl border border-emerald-700 bg-emerald-900/20 p-4">
            <p className="text-emerald-400 font-medium text-sm">🎉 Your bid has been selected!</p>
            <p className="text-emerald-300/70 text-xs mt-1">The purchase team will contact you to confirm the order.</p>
          </div>
        )}

        {data.existingBid?.status === 'REJECTED' && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
            <p className="text-zinc-400 font-medium text-sm">This bid was not selected this time.</p>
          </div>
        )}

        {/* Submission success */}
        {submitted && (
          <div className="rounded-xl border border-emerald-700 bg-emerald-900/20 p-4">
            <p className="text-emerald-400 font-medium">✓ Bid submitted successfully</p>
            <p className="text-emerald-300/70 text-xs mt-1">The purchase team will review your pricing and get in touch.</p>
          </div>
        )}

        {/* Bid form */}
        {!data.isExpired && data.existingBid?.status !== 'SELECTED' && data.existingBid?.status !== 'REJECTED' && (
          <form onSubmit={submit} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-4">
            <p className="text-sm font-medium text-white">
              {data.existingBid ? 'Update Your Bid' : 'Submit Your Bid'}
            </p>

            <div>
              <label className="text-xs text-zinc-400">Price per {pr.unit} (₹) *</label>
              <input type="number" required min="0" step="0.01"
                value={pricePerUnit}
                onChange={e => setPricePerUnit(e.target.value)}
                onWheel={e => (e.target as HTMLElement).blur()}
                placeholder="e.g. 250.00"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm" />
              {pricePerUnit && (
                <p className="text-xs text-zinc-400 mt-1">
                  Total: ₹{(parseFloat(pricePerUnit) * pr.quantityRequired).toLocaleString('en-IN')} for {pr.quantityRequired} {pr.unit}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400">Lead Time (days) *</label>
                <input type="number" required min="1" step="1"
                  value={leadTimeDays}
                  onChange={e => setLeadTimeDays(e.target.value)}
                  onWheel={e => (e.target as HTMLElement).blur()}
                  placeholder="e.g. 7"
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm" />
              </div>
              <div>
                <label className="text-xs text-zinc-400">Quote valid until *</label>
                <input type="date" required
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Payment terms, special conditions, etc."
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm resize-none" />
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button type="submit" disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50 transition-colors">
              {submitting ? 'Submitting…' : data.existingBid ? 'Update Bid' : 'Submit Bid'}
            </button>

            <p className="text-xs text-zinc-500 text-center">
              All bids are confidential and reviewed fairly by the purchase team.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
