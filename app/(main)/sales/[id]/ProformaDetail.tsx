'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Item = { id: string; description: string; hsnCode: string; quantity: number; unitPrice: number; discountPercent: number; voltageFrom?: string | null; voltageTo?: string | null; product?: { code: string; name: string } | null };
type Client = { id: string; code: string; customerName: string; email: string | null; phone: string | null; billingAddress: string | null; shippingAddress: string | null; gstNumber: string | null; globalOrIndian: string | null; state: string | null };
type Proforma = {
  id: string; invoiceNumber: string; invoiceDate: string; invoiceType: string;
  currency: string; exchangeRate: number | null;
  termsOfPayment: string | null; deliveryDays: number | null; termsOfDelivery: string | null;
  notes: string | null; status: string; rejectedReason: string | null;
  paymentReceiptUrl: string | null;
  splitInvoice: boolean; splitServicePercent: number | null;
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

function calcItem(item: Item) { return item.quantity * item.unitPrice * (1 - item.discountPercent / 100); }
function fmtAmt(n: number, currency: string) {
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
}

export function ProformaDetail({ proforma, role, userId }: { proforma: Proforma; role: string; userId: string }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState('');
  const [rejectModal,      setRejectModal]      = useState(false);
  const [rejectReason,     setRejectReason]     = useState('');
  const [convertModal,     setConvertModal]     = useState(false);
  const [orderNumber,      setOrderNumber]      = useState('');
  const [receiptUrl,       setReceiptUrl]       = useState<string | null>(proforma.paymentReceiptUrl);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [receiptError,     setReceiptError]     = useState('');

  // Split invoice state — initialised from proforma data
  const [splitInvoice,        setSplitInvoice]        = useState(proforma.splitInvoice ?? false);
  const [splitServicePercent, setSplitServicePercent] = useState<string>(
    proforma.splitServicePercent != null ? String(proforma.splitServicePercent) : ''
  );
  const [splitSaving, setSplitSaving]   = useState(false);
  const [splitError,  setSplitError]    = useState('');
  const [splitSaved,  setSplitSaved]    = useState(false);

  const isOwner          = proforma.createdBy.id === userId;
  const canEdit          = (role === 'ADMIN' || (role === 'SALES' && isOwner)) && proforma.status === 'DRAFT';
  const canDelete        = canEdit;
  // Split invoice can be set any time before order is converted (dispatch not yet done)
  const canEditSplit     = (role === 'ADMIN' || (role === 'SALES' && isOwner)) &&
                           !['CONVERTED', 'REJECTED'].includes(proforma.status) &&
                           proforma.invoiceType === 'SALE';
  const canSendApproval  = (role === 'ADMIN' || (role === 'SALES' && isOwner)) && proforma.status === 'DRAFT';
  const canApprove       = (role === 'ADMIN' || role === 'ACCOUNTS') && proforma.status === 'PENDING_APPROVAL';
  const canConvert       = (role === 'ADMIN' || role === 'ACCOUNTS') && proforma.status === 'APPROVED' && !proforma.order;
  const canUploadReceipt = (role === 'ADMIN' || (role === 'SALES' && isOwner)) && ['DRAFT', 'PENDING_APPROVAL'].includes(proforma.status);
  const isReceiptPdf     = receiptUrl ? receiptUrl.toLowerCase().includes('.pdf') : false;

  // Compute items excluding shipping HSN 9965
  const productItems = proforma.items.filter((i) => i.hsnCode !== '9965');
  const subtotal    = productItems.reduce((s, i) => s + calcItem(i), 0);
  const fullSubtotal = proforma.items.reduce((s, i) => s + calcItem(i), 0);
  const isExport    = proforma.currency === 'USD';
  const sellerState = 'gujarat';
  const buyerState  = (proforma.client.state ?? '').toLowerCase();
  const isIntra     = !isExport && !!buyerState && buyerState === sellerState;
  const gst         = isExport ? 0 : fullSubtotal * 0.18;
  const total       = fullSubtotal + gst;
  const st          = STATUS_STYLE[proforma.status] ?? STATUS_STYLE.DRAFT;

  // Split invoice preview
  const servicePctNum = parseFloat(splitServicePercent);
  const goodsPctNum   = isNaN(servicePctNum) ? null : 100 - servicePctNum;
  const serviceAmt    = !isNaN(servicePctNum) ? subtotal * (servicePctNum / 100) : null;
  const goodsAmt      = !isNaN(servicePctNum) ? subtotal * ((100 - servicePctNum) / 100) : null;

  async function saveSplitInvoice(override?: { splitInvoice?: boolean; splitServicePercent?: string }) {
    setSplitError(''); setSplitSaved(false); setSplitSaving(true);
    const si  = override?.splitInvoice  !== undefined ? override.splitInvoice  : splitInvoice;
    const ssp = override?.splitServicePercent !== undefined ? override.splitServicePercent : splitServicePercent;
    const pct = parseFloat(ssp);
    if (si && (isNaN(pct) || pct <= 0 || pct >= 100)) {
      setSplitError('Enter a service % between 1 and 99.');
      setSplitSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/proformas/${proforma.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          splitInvoice: si,
          splitServicePercent: si ? pct : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setSplitError(d.error || 'Failed to save');
      } else {
        setSplitSaved(true);
        setTimeout(() => setSplitSaved(false), 2000);
      }
    } catch {
      setSplitError('Network error');
    } finally {
      setSplitSaving(false);
    }
  }

  async function sendForApproval() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/proformas/${proforma.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PENDING_APPROVAL' }) });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); } else router.refresh();
    } catch { setError('Network error'); } finally { setLoading(false); }
  }

  async function approve() {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/proformas/${proforma.id}/approve`, { method: 'POST' });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); } else router.refresh();
    } catch { setError('Network error'); } finally { setLoading(false); }
  }

  async function reject() {
    if (!rejectReason.trim()) { setError('Enter a reason'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/proformas/${proforma.id}/reject`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: rejectReason }) });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed'); } else { setRejectModal(false); router.refresh(); }
    } catch { setError('Network error'); } finally { setLoading(false); }
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
      const res = await fetch(`/api/proformas/${proforma.id}/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderNumber: orderNumber.trim() }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Failed'); setLoading(false); return; }
      setConvertModal(false); router.refresh();
    } catch { setError('Network error'); setLoading(false); }
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptError(''); setUploadingReceipt(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch(`/api/proformas/${proforma.id}/receipt`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setReceiptError(data.error || 'Upload failed'); return; }
      setReceiptUrl(data.paymentReceiptUrl);
    } catch { setReceiptError('Network error during upload'); }
    finally { setUploadingReceipt(false); e.target.value = ''; }
  }

  async function removeReceipt() {
    setReceiptError(''); setUploadingReceipt(true);
    try {
      const res = await fetch(`/api/proformas/${proforma.id}/receipt`, { method: 'DELETE' });
      if (res.ok) setReceiptUrl(null);
      else { const d = await res.json(); setReceiptError(d.error || 'Failed to remove'); }
    } catch { setReceiptError('Network error'); }
    finally { setUploadingReceipt(false); }
  }

  return (
    <div className="space-y-5 pb-12">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-mono font-semibold">{proforma.invoiceNumber}</h2>
          <span className="text-xs font-medium px-2 py-0.5 rounded border" style={{ background: st.bg, color: st.color, borderColor: st.border }}>
            {proforma.status.replace('_', ' ')}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{proforma.currency}</span>
          {proforma.splitInvoice && (
            <span
              className="text-xs font-medium px-2 py-0.5 rounded border"
              style={{ background: 'rgba(139,92,246,0.1)', color: '#c4b5fd', borderColor: 'rgba(139,92,246,0.3)' }}
            >
              Split Invoice
            </span>
          )}
        </div>
        <p className="text-zinc-500 text-sm mt-0.5">
          {new Date(proforma.invoiceDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
          {' · '}{proforma.invoiceType}{' · '}{proforma.createdBy.name}
        </p>
      </div>

      {error && <div className="p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{error}</div>}

      {proforma.status === 'REJECTED' && proforma.rejectedReason && (
        <div className="p-3 rounded-lg text-sm text-amber-400" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <span className="font-medium">Rejected: </span>{proforma.rejectedReason}
        </div>
      )}

      {proforma.order && (
        <div className="flex items-center gap-2 p-3 rounded-lg text-sm text-sky-400" style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)' }}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /></svg>
          Converted to Order: {proforma.order.orderNumber} · {proforma.order.status}
        </div>
      )}

      {/* ── PAYMENT RECEIPT — shown FIRST so Accounts sees it before the approve button ── */}
      {receiptError && <div className="p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{receiptError}</div>}

      {/* Hidden file input triggered by buttons below */}
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleReceiptUpload} disabled={uploadingReceipt} />

      {receiptUrl ? (
        <div className="rounded-xl border p-4" style={{ background: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.2)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(34,197,94,0.12)' }}>
                {isReceiptPdf
                  ? <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                  : <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
                }
              </div>
              <div>
                <p className="text-sm font-medium text-green-300">Payment Receipt Attached</p>
                <p className="text-xs text-zinc-500 mt-0.5">{isReceiptPdf ? 'PDF Document' : 'Image'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a href={`/api/blob-image?url=${encodeURIComponent(receiptUrl)}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-green-300"
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                View
              </a>
              {canUploadReceipt && (
                <>
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploadingReceipt}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white transition-colors"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                    {uploadingReceipt ? 'Uploading…' : 'Replace'}
                  </button>
                  <button onClick={removeReceipt} disabled={uploadingReceipt} title="Remove receipt"
                    className="px-2 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-red-400 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </>
              )}
            </div>
          </div>
          {!isReceiptPdf && (
            <div className="mt-3 rounded-lg overflow-hidden border border-zinc-700" style={{ maxHeight: 200 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/blob-image?url=${encodeURIComponent(receiptUrl)}`} alt="Payment receipt" className="w-full object-contain" style={{ maxHeight: 200 }} />
            </div>
          )}
        </div>
      ) : (
        <>
          {canApprove && (
            <div className="p-3 rounded-lg text-sm text-amber-400" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                No payment receipt uploaded yet. Review invoice carefully before approving.
              </div>
            </div>
          )}
          {canUploadReceipt && (
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadingReceipt}
              className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-zinc-700 hover:border-green-500 text-sm text-zinc-500 hover:text-green-400 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              {uploadingReceipt ? 'Uploading…' : 'Upload Payment Receipt'}
            </button>
          )}
        </>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
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

      {/* Client */}
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
        {proforma.termsOfPayment && <div><p className="text-zinc-600 text-xs mb-0.5">Payment Terms</p><p className="text-white">{proforma.termsOfPayment}</p></div>}
        {proforma.deliveryDays && <div><p className="text-zinc-600 text-xs mb-0.5">Delivery</p><p className="text-white">Within {proforma.deliveryDays} days</p></div>}
        {proforma.termsOfDelivery && <div><p className="text-zinc-600 text-xs mb-0.5">Delivery Terms</p><p className="text-white">{proforma.termsOfDelivery}</p></div>}
        {isExport && proforma.exchangeRate && <div><p className="text-zinc-600 text-xs mb-0.5">Exchange Rate</p><p className="text-white">₹{proforma.exchangeRate}/$</p></div>}
      </div>

      {/* ── Split Invoice ── shown for SALE type PIs until converted/rejected ── */}
      {canEditSplit && (
        <div
          className="card p-4 space-y-3"
          style={{ border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.03)' }}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Split Invoice</p>
            {splitSaved && (
              <span className="text-xs text-green-400">Saved ✓</span>
            )}
          </div>

          {/* Toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              className="relative w-10 h-5 rounded-full transition-colors"
              style={{ background: splitInvoice ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.1)' }}
              onClick={() => {
                const next = !splitInvoice;
                setSplitInvoice(next);
                saveSplitInvoice({ splitInvoice: next });
              }}
            >
              <div
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ transform: splitInvoice ? 'translateX(22px)' : 'translateX(2px)' }}
              />
            </div>
            <span className="text-sm text-zinc-300">
              {splitInvoice ? 'Split into Goods + Service invoices' : 'Single invoice (no split)'}
            </span>
          </label>

          {/* Service % input */}
          {splitInvoice && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500 w-28 shrink-0">Service %</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={splitServicePercent}
                    onChange={(e) => setSplitServicePercent(e.target.value)}
                    onBlur={() => saveSplitInvoice()}
                    placeholder="e.g. 70"
                    className="w-24 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-violet-500"
                  />
                  <span className="text-zinc-500 text-sm">%</span>
                  <button
                    type="button"
                    onClick={() => saveSplitInvoice()}
                    disabled={splitSaving}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                    style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd' }}
                  >
                    {splitSaving ? '…' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Preview */}
              {goodsAmt !== null && serviceAmt !== null && goodsPctNum !== null && (
                <div
                  className="rounded-lg px-3 py-2 text-xs space-y-1"
                  style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)' }}
                >
                  <div className="text-zinc-500 mb-1">Invoice split preview (product subtotal):</div>
                  <div className="flex gap-4">
                    <span style={{ color: '#4ade80' }}>
                      Goods {goodsPctNum.toFixed(0)}% = {fmtAmt(goodsAmt, proforma.currency)}
                    </span>
                    <span style={{ color: '#fbbf24' }}>
                      Service {servicePctNum.toFixed(0)}% = {fmtAmt(serviceAmt, proforma.currency)}
                    </span>
                  </div>
                </div>
              )}

              {splitError && (
                <p className="text-xs text-red-400">{splitError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Read-only split info for non-editors (accounts/admin viewing approved PI) */}
      {!canEditSplit && proforma.splitInvoice && proforma.splitServicePercent != null && (
        <div
          className="card p-4"
          style={{ border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.03)' }}
        >
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Split Invoice</p>
          <div className="text-sm text-zinc-300">
            Goods {(100 - proforma.splitServicePercent).toFixed(0)}% · Service {proforma.splitServicePercent.toFixed(0)}%
          </div>
          <div className="flex gap-4 text-xs mt-1">
            <span style={{ color: '#4ade80' }}>
              Goods = {fmtAmt(subtotal * ((100 - proforma.splitServicePercent) / 100), proforma.currency)}
            </span>
            <span style={{ color: '#fbbf24' }}>
              Service = {fmtAmt(subtotal * (proforma.splitServicePercent / 100), proforma.currency)}
            </span>
          </div>
        </div>
      )}

      {/* Line Items */}
      <div className="card overflow-hidden">
        <div className="p-3 border-b border-zinc-800"><p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Line Items</p></div>
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
                  <td className="p-3 text-white">
                    {item.description}
                    {(item.voltageFrom || item.voltageTo) && (
                      <span className="ml-2 text-xs text-zinc-500">({item.voltageFrom || '?'}V – {item.voltageTo || '?'}V)</span>
                    )}
                  </td>
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
        <div className="p-4 border-t border-zinc-800 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-zinc-500">Sub Total</span><span>{fmtAmt(fullSubtotal, proforma.currency)}</span></div>
          {!isExport && isIntra && (
            <>
              <div className="flex justify-between text-sm text-zinc-500"><span>CGST 9%</span><span>{fmtAmt(fullSubtotal * 0.09, proforma.currency)}</span></div>
              <div className="flex justify-between text-sm text-zinc-500"><span>SGST 9%</span><span>{fmtAmt(fullSubtotal * 0.09, proforma.currency)}</span></div>
            </>
          )}
          {!isExport && !isIntra && <div className="flex justify-between text-sm text-zinc-500"><span>IGST 18%</span><span>{fmtAmt(gst, proforma.currency)}</span></div>}
          <div className="flex justify-between font-semibold text-sky-400 border-t border-zinc-800 pt-2"><span>Total</span><span>{fmtAmt(total, proforma.currency)}</span></div>
          {isExport && proforma.exchangeRate && (
            <div className="flex justify-between text-xs text-zinc-600">
              <span>≈ INR @ ₹{proforma.exchangeRate}/$</span>
              <span>₹{(total * proforma.exchangeRate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          )}
        </div>
      </div>

      {proforma.notes && <div className="card p-4"><p className="text-xs text-zinc-600 mb-1">Notes</p><p className="text-sm text-zinc-300">{proforma.notes}</p></div>}

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setRejectModal(false)}>
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-3">Reject Invoice</h3>
            <label className="block text-xs text-zinc-400 mb-1">Reason for rejection</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500 resize-none mb-3" placeholder="Enter reason…" />
            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setRejectModal(false)} className="flex-1 py-2 rounded-lg border border-zinc-600 text-sm text-zinc-400">Cancel</button>
              <button onClick={reject} disabled={loading} className="flex-1 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-sm text-white font-medium">{loading ? 'Rejecting…' : 'Reject'}</button>
            </div>
          </div>
        </div>
      )}

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
              <button onClick={convertToOrder} disabled={loading} className="flex-1 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-sm text-white font-medium">{loading ? 'Converting…' : 'Convert'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
