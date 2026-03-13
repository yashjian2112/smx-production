'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Item = { id: string; description: string; hsnCode: string; quantity: number; unitPrice: number; discountPercent: number; product?: { code: string; name: string } | null };
type Client = { id: string; code: string; customerName: string; email: string | null; phone: string | null; billingAddress: string | null; shippingAddress: string | null; gstNumber: string | null; globalOrIndian: string | null; state: string | null };
type Proforma = {
  id: string; invoiceNumber: string; invoiceDate: string; invoiceType: string;
  currency: string; exchangeRate: number | null;
  termsOfPayment: string | null; deliveryDays: number | null; termsOfDelivery: string | null;
  notes: string | null; status: string; rejectedReason: string | null;
  createdBy: { id: string; name: string }; approvedBy: { id: string; name: string } | null;
  approvedAt: string | null; client: Client; items: Item[];
  order: { id: string; orderNumber: string; status: string } | null;
  relatedInvoice: { id: string; invoiceNumber: string } | null;
};

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  DRAFT:            { bg: 'rgba(113,113,122,0.1)', color: '#a1a1aa', border: 'rgba(113,113,122,0.2)' },
  PENDING_APPROVAL: { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  APPROVED:         { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80', border: 'rgba(34,197,94,0.2)'  },
  REJECTED:         { bg: 'rgba(239,68,68,0.1)',   color: '#f87171', border: 'rgba(239,68,68,0.2)'  },
  CONVERTED:        { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
};

function calcItem(item: Item) {
  return item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
}

function fmtAmt(n: number, currency: string) {
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export function ProformaDetail({ proforma, role, userId }: { proforma: Proforma; role: string; userId: string }) {
  const router = useRouter();
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [rejectModal,   setRejectModal]   = useState(false);
  const [rejectReason,  setRejectReason]  = useState('');
  const [convertModal,  setConvertModal]  = useState(false);
  const [orderNumber,   setOrderNumber]   = useState('');

  const isOwner   = proforma.createdBy.id === userId;
  const canEdit   = (role === 'ADMIN' || (role === 'SALES' && isOwner)) && proforma.status === 'DRAFT';
  const canDelete = canEdit;
  const canSendApproval = (role === 'ADMIN' || (role === 'SALES' && isOwner)) && proforma.status === 'DRAFT';
  const canApprove= (role === 'ADMIN' || role === 'ACCOUNTS') && proforma.status === 'PENDING_APPROVAL';
  const canConvert= (role === 'ADMIN' || role === 'ACCOUNTS') && proforma.status === 'APPROVED' && !proforma.order;

  const subtotal  = proforma.items.reduce((s, i) => s + calcItem(i), 0);
  const isExport  = proforma.currency === 'USD';
  const sellerState = 'gujarat';
  const buyerState  = (proforma.client.state ?? '').toLowerCase();
  const isIntra   = !isExport && !!buyerState && buyerState === sellerState;
  const gst       = isExport ? 0 : subtotal * 0.18;
  const total     = subtotal + gst;

  const st = STATUS_STYLE[proforma.status] ?? STATUS_STYLE.DRAFT;

  async function sendForApproval() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/proformas/${proforma.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PENDING_APPROVAL' }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); }
      else router.refresh();
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  async function approve() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/proformas/${proforma.id}/approve`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); }
      else router.refresh();
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  async function reject() {
    if (!rejectReason.trim()) { setError('Enter a reason'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/proformas/${proforma.id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); }
      else { setRejectModal(false); router.refresh(); }
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  async function deletePI() {
    if (!confirm('Delete this draft invoice?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/proformas/${proforma.id}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); setLoading(false); return; }
      router.push('/sales');
    } catch { setError('Network error'); setLoading(false); }
  }

  async function convertToOrder() {
    if (!orderNumber.trim()) { setError('Enter a work order number'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/proformas/${proforma.id}/convert`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber: orderNumber.trim() }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Failed'); setLoading(false); return; }
      setConvertModal(false);
      router.refresh();
    } catch { setError('Network error'); setLoading(false); }
  }

  return (
    <div className="space-y-5 pb-12">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-mono font-semibold">{proforma.invoiceNumber}</h2>
            <span className="text-xs font-medium px-2 py-0.5 rounded border" style={{ background: st.bg, color: st.color, borderColor: st.border }}>
              {proforma.status.replace('_', ' ')}
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{proforma.currency}</span>
          </div>
          <p className="text-zinc-500 text-sm mt-0.5">
            {new Date(proforma.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
            {' · '}{proforma.invoiceType}
            {' · '}{proforma.createdBy.name}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* Rejection reason */}
      {proforma.status === 'REJECTED' && proforma.rejectedReason && (
        <div className="p-3 rounded-lg text-sm text-amber-400" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <span className="font-medium">Rejected: </span>{proforma.rejectedReason}
        </div>
      )}

      {/* Converted to Order */}
      {proforma.order && (
        <Link href={`/orders/${proforma.order.id}`} className="flex items-center gap-2 p-3 rounded-lg text-sm text-sky-400" style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /></svg>
          Converted to Order: {proforma.order.orderNumber} · {proforma.order.status}
        </Link>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {/* Download PDF */}
        <a href={`/print/proforma/${proforma.id}`} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 hover:border-sky-500 text-sm text-zinc-300 hover:text-sky-400 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" /></svg>
          Download PDF
        </a>

        {canEdit && (
          <Link href={`/sales/${proforma.id}/edit`}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-700 hover:border-zinc-400 text-sm text-zinc-300 hover:text-white transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5m-1.414-9.414a2 2 0 1 1 2.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
            Edit
          </Link>
        )}

        {canSendApproval && (
          <button onClick={sendForApproval} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-sm text-white font-medium transition-colors disabled:opacity-50">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
            Send for Approval
          </button>
        )}

        {canApprove && (
          <>
            <button onClick={approve} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-sm text-white font-medium transition-colors disabled:opacity-50">
              ✓ Approve
            </button>
            <button onClick={() => setRejectModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-sm text-white font-medium transition-colors">
              ✕ Reject
            </button>
          </>
        )}

        {canConvert && (
          <button onClick={() => setConvertModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-sm text-white font-medium transition-colors">
            → Convert to Production Order
          </button>
        )}

        {canDelete && (
          <button onClick={deletePI} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-800/50 hover:border-red-600 text-sm text-red-400 hover:text-red-300 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0 1 16.138 21H7.862a2 2 0 0 1-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v3M4 7h16" /></svg>
            Delete
          </button>
        )}
      </div>

      {/* Client Card */}
      <div className="card p-4 space-y-1">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Client</p>
        <p className="font-semibold text-white">{proforma.client.customerName}</p>
        {proforma.client.email && <p className="text-zinc-400 text-sm">{proforma.client.email}</p>}
        {proforma.client.phone && <p className="text-zinc-400 text-sm">{proforma.client.phone}</p>}
        {proforma.client.billingAddress && <p className="text-zinc-500 text-xs whitespace-pre-line">{proforma.client.billingAddress}</p>}
        {proforma.client.gstNumber && <p className="text-zinc-600 text-xs font-mono">GST: {proforma.client.gstNumber}</p>}
        {proforma.client.globalOrIndian && (
          <span className="inline-block text-[10px] px-1.5 py-0.5 rounded border mt-1"
            style={proforma.client.globalOrIndian === 'Global'
              ? { background: 'rgba(56,189,248,0.1)', borderColor: 'rgba(56,189,248,0.3)', color: '#38bdf8' }
              : { background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.3)', color: '#fbbf24' }}>
            {proforma.client.globalOrIndian}
          </span>
        )}
      </div>

      {/* Terms */}
      <div className="card p-4 grid grid-cols-2 gap-3 text-sm">
        {proforma.termsOfPayment && (
          <div><p className="text-zinc-600 text-xs mb-0.5">Payment Terms</p><p className="text-white">{proforma.termsOfPayment}</p></div>
        )}
        {proforma.deliveryDays && (
          <div><p className="text-zinc-600 text-xs mb-0.5">Delivery</p><p className="text-white">Within {proforma.deliveryDays} days</p></div>
        )}
        {proforma.termsOfDelivery && (
          <div><p className="text-zinc-600 text-xs mb-0.5">Delivery Terms</p><p className="text-white">{proforma.termsOfDelivery}</p></div>
        )}
        {isExport && proforma.exchangeRate && (
          <div><p className="text-zinc-600 text-xs mb-0.5">Exchange Rate</p><p className="text-white">₹{proforma.exchangeRate}/$</p></div>
        )}
      </div>

      {/* Line Items */}
      <div className="card overflow-hidden">
        <div className="p-3 border-b border-zinc-800">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Line Items</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left p-3 text-xs text-zinc-600 font-medium">Description</th>
                <th className="text-center p-3 text-xs text-zinc-600 font-medium">HSN</th>
                <th className="text-center p-3 text-xs text-zinc-600 font-medium">Qty</th>
                <th className="text-right p-3 text-xs text-zinc-600 font-medium">Rate</th>
                <th className="text-center p-3 text-xs text-zinc-600 font-medium">Disc%</th>
                <th className="text-right p-3 text-xs text-zinc-600 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {proforma.items.map((item) => (
                <tr key={item.id} className="border-b border-zinc-900">
                  <td className="p-3 text-white">{item.description}</td>
                  <td className="p-3 text-center text-zinc-400 font-mono text-xs">{item.hsnCode}</td>
                  <td className="p-3 text-center text-zinc-400">{item.quantity} PCS</td>
                  <td className="p-3 text-right text-zinc-400">{fmtAmt(item.unitPrice, proforma.currency)}</td>
                  <td className="p-3 text-center text-zinc-400">{item.discountPercent ? `${item.discountPercent}%` : '—'}</td>
                  <td className="p-3 text-right text-white font-medium">{fmtAmt(calcItem(item), proforma.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="p-4 border-t border-zinc-800 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-zinc-500">Sub Total</span><span>{fmtAmt(subtotal, proforma.currency)}</span></div>
          {!isExport && isIntra && (
            <>
              <div className="flex justify-between text-sm text-zinc-500"><span>CGST 9%</span><span>{fmtAmt(subtotal * 0.09, proforma.currency)}</span></div>
              <div className="flex justify-between text-sm text-zinc-500"><span>SGST 9%</span><span>{fmtAmt(subtotal * 0.09, proforma.currency)}</span></div>
            </>
          )}
          {!isExport && !isIntra && (
            <div className="flex justify-between text-sm text-zinc-500"><span>IGST 18%</span><span>{fmtAmt(gst, proforma.currency)}</span></div>
          )}
          <div className="flex justify-between font-semibold text-sky-400 border-t border-zinc-800 pt-2">
            <span>Total</span><span>{fmtAmt(total, proforma.currency)}</span>
          </div>
          {isExport && proforma.exchangeRate && (
            <div className="flex justify-between text-xs text-zinc-600">
              <span>≈ INR @ ₹{proforma.exchangeRate}/$</span>
              <span>₹{(total * proforma.exchangeRate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>
      </div>

      {proforma.notes && (
        <div className="card p-4">
          <p className="text-xs text-zinc-600 mb-1">Notes</p>
          <p className="text-sm text-zinc-300">{proforma.notes}</p>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setRejectModal(false)}>
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-3">Reject Invoice</h3>
            <label className="block text-xs text-zinc-400 mb-1">Reason for rejection</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 resize-none mb-3" placeholder="Enter reason…" />
            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setRejectModal(false)} className="flex-1 py-2 rounded-lg border border-zinc-600 text-sm text-zinc-400">Cancel</button>
              <button onClick={reject} disabled={loading} className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-sm text-white font-medium">
                {loading ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Order Modal */}
      {convertModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setConvertModal(false)}>
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-1">Convert to Production Order</h3>
            <p className="text-xs text-zinc-500 mb-3">This will create a new production order and generate all unit serials.</p>
            <label className="block text-xs text-zinc-400 mb-1">Work Order Number</label>
            <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500 mb-3" placeholder="e.g. WO-2026-042" />
            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setConvertModal(false)} className="flex-1 py-2 rounded-lg border border-zinc-600 text-sm text-zinc-400">Cancel</button>
              <button onClick={convertToOrder} disabled={loading} className="flex-1 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-sm text-white font-medium">
                {loading ? 'Converting…' : 'Convert'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
