'use client';

import { useState, useEffect } from 'react';

type RFQItem = {
  id: string; materialId?: string | null; qtyRequired: number;
  itemDescription?: string | null; itemUnit?: string | null;
  material?: { id: string; name: string; code: string; unit: string } | null;
};
type RFQ = {
  id: string; rfqNumber: string; title: string; description?: string;
  fileUrls: string[]; deadline?: string; status: string;
  items: RFQItem[];
};

type POItem = { id: string; quantity: number; unitPrice: number; rawMaterial: { name: string; unit: string } };
type VendorInvoiceItem = { id: string; invoiceNumber: string; amount: number; gstAmount: number; tdsAmount: number; netAmount: number; status: string; submittedAt: string };
type VendorPO = {
  id: string; poNumber: string; status: string; totalAmount: number; currency: string;
  paymentStatus: string; paidAmount: number; expectedDelivery?: string; createdAt: string;
  rfq?: { rfqNumber: string; title: string; paymentTerms?: string } | null;
  items: POItem[];
  vendorInvoices: VendorInvoiceItem[];
  paymentRequest?: { id: string; requestNumber: string; status: string } | null;
};

export default function VendorPortal({ token }: { token: string }) {
  const [activeTab, setActiveTab] = useState<'rfq' | 'pos'>('rfq');
  const [rfq, setRFQ] = useState<RFQ | null>(null);
  const [vendorName, setVendorName] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [myPOs, setMyPOs] = useState<VendorPO[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState<VendorPO | null>(null);

  // Quote form state
  const [currency, setCurrency] = useState('INR');
  const [gstType, setGstType] = useState<'without' | 'with'>('without');
  const [gstPercent, setGstPercent] = useState('18');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);

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

  function loadPOs() {
    setPosLoading(true);
    fetch(`/api/vendor-portal/my-pos?token=${token}`)
      .then(r => r.ok ? r.json() : Promise.reject('Failed to load POs'))
      .then((data: { vendorName: string; pos: VendorPO[] }) => {
        setMyPOs(data.pos);
        if (data.vendorName && !vendorName) setVendorName(data.vendorName);
      })
      .catch(() => {})
      .finally(() => setPosLoading(false));
  }

  useEffect(() => {
    if (activeTab === 'pos') loadPOs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/procurement/upload', { method: 'POST', body: fd });
      if (r.ok) { const d = await r.json(); setFileUrls(prev => [...prev, d.url]); }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rfq) return;
    if (!leadTimeDays || !validUntil) return alert('Lead time and valid until date are required');
    if (!notes.trim()) return alert('Notes / Terms are required');
    if (fileUrls.length === 0) return alert('Please attach your quotation PDF before submitting');
    const items = rfq.items.map(i => ({
      rfqItemId: i.id,
      materialId: i.materialId ?? undefined,
      unitPrice: parseFloat(itemPrices[i.id] ?? '0') || 0,
      qty: i.qtyRequired,
    }));
    if (items.some(i => i.unitPrice <= 0)) return alert('Enter price for all items');
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const gstAmount = currency === 'INR' && gstType === 'with' ? subtotal * (parseFloat(gstPercent) || 0) / 100 : 0;
    const totalAmount = subtotal + gstAmount;
    const gstNote = currency === 'INR' ? (gstType === 'with' ? `[GST ${gstPercent}% included: ₹${gstAmount.toFixed(2)}]` : '[Prices exclusive of GST]') : '';
    const finalNotes = [gstNote, notes].filter(Boolean).join('\n');

    setSubmitting(true);
    try {
      const r = await fetch(`/api/procurement/rfq/${rfq.id}/quotes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, currency, leadTimeDays: parseInt(leadTimeDays), validUntil, notes: finalNotes, fileUrls, items }),
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

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 mb-5">
          <button onClick={() => setActiveTab('rfq')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'rfq' ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
            RFQ / Quote
          </button>
          <button onClick={() => setActiveTab('pos')}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'pos' ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
            My POs
          </button>
        </div>
      </div>

      {activeTab === 'pos' && (
        <div className="max-w-lg mx-auto px-4 pb-8 space-y-3">
          {posLoading ? (
            <div className="text-center text-zinc-500 py-8 text-sm">Loading...</div>
          ) : myPOs.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
              <p className="text-zinc-500 text-sm">No purchase orders assigned to you yet.</p>
            </div>
          ) : myPOs.map(po => (
            <div key={po.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-white font-semibold text-sm">{po.poNumber}</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${po.status === 'RECEIVED' ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                      {po.status.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${po.paymentStatus === 'PAID' ? 'bg-emerald-900/40 text-emerald-300' : po.paymentStatus === 'PARTIAL' ? 'bg-yellow-900/40 text-yellow-300' : 'bg-zinc-800 text-zinc-500'}`}>
                      {po.paymentStatus}
                    </span>
                  </div>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    {po.currency === 'USD' ? '$' : '₹'}{po.totalAmount.toLocaleString('en-IN')}
                    {po.rfq?.paymentTerms && <> · {po.rfq.paymentTerms}</>}
                    {po.expectedDelivery && <> · ETA: {new Date(po.expectedDelivery).toLocaleDateString('en-IN')}</>}
                  </p>
                </div>
                {['RECEIVED', 'PARTIALLY_RECEIVED'].includes(po.status) && po.vendorInvoices.length === 0 && (
                  <button onClick={() => setInvoiceModal(po)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-700 hover:bg-sky-600 text-white shrink-0">
                    Submit Invoice
                  </button>
                )}
              </div>
              {po.items.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-zinc-800">
                  {po.items.map(item => (
                    <div key={item.id} className="flex justify-between text-xs">
                      <span className="text-zinc-400">{item.rawMaterial.name}</span>
                      <span className="text-zinc-500">{item.quantity} {item.rawMaterial.unit} · ₹{item.unitPrice}/unit</span>
                    </div>
                  ))}
                </div>
              )}
              {po.vendorInvoices.length > 0 && (
                <div className="pt-2 border-t border-zinc-800">
                  {po.vendorInvoices.map(inv => (
                    <div key={inv.id} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Invoice: {inv.invoiceNumber}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-300">₹{inv.netAmount.toLocaleString('en-IN')} net</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${inv.status === 'PAID' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>{inv.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {po.paymentRequest && (
                <p className="text-xs text-violet-400 pt-1 border-t border-zinc-800">
                  Payment: {po.paymentRequest.requestNumber} — {po.paymentRequest.status.replace(/_/g, ' ')}
                </p>
              )}
            </div>
          ))}
          {invoiceModal && (
            <SubmitInvoiceModal po={invoiceModal} token={token} onClose={() => setInvoiceModal(null)} onSubmitted={() => { setInvoiceModal(null); loadPOs(); }} />
          )}
        </div>
      )}

      {activeTab === 'rfq' && <div className="max-w-lg mx-auto px-4 pt-0 space-y-5">
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
          {/* Files — preview + download */}
          {rfq.fileUrls.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Drawings & Specs ({rfq.fileUrls.length})</p>
                {rfq.fileUrls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => rfq.fileUrls.forEach((u, i) => {
                      setTimeout(() => {
                        const a = document.createElement('a');
                        a.href = u; a.download = u.split('/').pop() ?? `file-${i + 1}`;
                        a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
                      }, i * 400);
                    })}
                    className="text-xs text-blue-400 hover:text-blue-300 underline">
                    ⬇ Download All
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {rfq.fileUrls.map((u, i) => {
                  const name = u.split('/').pop()?.split('?')[0] ?? `File ${i + 1}`;
                  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(name);
                  const isPDF = /\.pdf$/i.test(name);
                  return (
                    <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800/60 overflow-hidden">
                      {/* Image preview */}
                      {isImage && (
                        <img src={u} alt={name} className="w-full max-h-48 object-contain bg-zinc-900 cursor-pointer"
                          onClick={() => setPreviewFile(u)} />
                      )}
                      {/* PDF preview strip */}
                      {isPDF && (
                        <div className="bg-zinc-900 h-10 flex items-center justify-center cursor-pointer"
                          onClick={() => setPreviewFile(u)}>
                          <span className="text-xs text-zinc-400">📄 Click to preview PDF</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between px-3 py-2 gap-2">
                        <span className="text-xs text-zinc-300 truncate flex-1">{name}</span>
                        <div className="flex gap-2 shrink-0">
                          {(isPDF || isImage) && (
                            <button type="button" onClick={() => setPreviewFile(u)}
                              className="text-xs text-sky-400 hover:text-sky-300">Preview</button>
                          )}
                          <a href={u} download={name} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300">⬇ Download</a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
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
                  <span className="text-zinc-200">{item.material?.name ?? item.itemDescription ?? 'Item'}</span>
                  {item.material?.code && <span className="text-zinc-500 ml-2 text-xs">{item.material.code}</span>}
                </div>
                <span className="text-zinc-400">{item.qtyRequired} {item.material?.unit ?? item.itemUnit ?? 'unit'}</span>
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400">Currency *</label>
                <select value={currency} onChange={e => { setCurrency(e.target.value); if (e.target.value !== 'INR') setGstType('without'); }}
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none">
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
              {currency === 'INR' && (
                <div>
                  <label className="text-xs text-zinc-400">GST *</label>
                  <div className="flex mt-1 rounded-lg overflow-hidden border border-zinc-700">
                    <button type="button" onClick={() => setGstType('without')}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${gstType === 'without' ? 'bg-sky-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                      Without GST
                    </button>
                    <button type="button" onClick={() => setGstType('with')}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors ${gstType === 'with' ? 'bg-sky-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                      With GST
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* GST % input when With GST selected */}
            {currency === 'INR' && gstType === 'with' && (
              <div>
                <label className="text-xs text-zinc-400">GST Rate (%)</label>
                <div className="flex gap-2 mt-1">
                  {['5', '12', '18', '28'].map(p => (
                    <button key={p} type="button" onClick={() => setGstPercent(p)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${gstPercent === p ? 'bg-sky-600 border-sky-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'}`}>
                      {p}%
                    </button>
                  ))}
                  <input type="number" min={0} max={100} step="0.1"
                    value={gstPercent} onChange={e => setGstPercent(e.target.value)}
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none focus:border-blue-500"
                    placeholder="%" />
                </div>
              </div>
            )}

            {/* Per-item pricing */}
            <div>
              <label className="text-xs text-zinc-400 font-medium">Price per Item * <span className="text-zinc-600 font-normal">(excl. GST)</span></label>
              <div className="space-y-2 mt-2">
                {rfq.items.map(item => (
                  <div key={item.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-zinc-300 min-w-0 truncate">{item.material?.name ?? item.itemDescription ?? 'Item'} <span className="text-zinc-500">× {item.qtyRequired} {item.material?.unit ?? item.itemUnit ?? 'unit'}</span></span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-zinc-500 text-sm">{currency === 'USD' ? '$' : '₹'}</span>
                      <input type="number" min={0} step="0.01" placeholder="0.00"
                        value={itemPrices[item.id] ?? ''}
                        onChange={e => setItemPrices(p => ({ ...p, [item.id]: e.target.value }))}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className="w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm text-right focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>
                ))}
                {/* Totals breakdown */}
                {(() => {
                  const sym = currency === 'USD' ? '$' : '₹';
                  const subtotal = rfq.items.reduce((s, i) => s + (parseFloat(itemPrices[i.id] ?? '0') || 0) * (i.qtyRequired || 0), 0);
                  const gst = currency === 'INR' && gstType === 'with' ? subtotal * (parseFloat(gstPercent) || 0) / 100 : 0;
                  const total = subtotal + gst;
                  return (
                    <div className="pt-2 border-t border-zinc-700 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Subtotal</span>
                        <span className="text-zinc-300">{sym}{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      {gst > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-400">GST ({gstPercent}%)</span>
                          <span className="text-zinc-300">+ {sym}{gst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-semibold pt-1 border-t border-zinc-700/50">
                        <span className="text-white">Total Quote</span>
                        <span className="text-white">{sym}{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  );
                })()}
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
              <label className="text-xs text-zinc-400">Notes / Terms *</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} required
                placeholder="Payment terms, warranty, delivery conditions, validity..."
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-blue-500" />
            </div>

            {/* Attachment — mandatory */}
            <div>
              <label className="text-xs text-zinc-400">Attach Quotation PDF *</label>
              <input type="file" accept=".pdf,.jpg,.png" multiple onChange={handleFileUpload}
                className="w-full mt-1 text-zinc-400 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-zinc-700 file:text-white hover:file:bg-zinc-600" />
              {fileUrls.length > 0
                ? <p className="text-xs text-blue-400 mt-1">✓ {fileUrls.length} file{fileUrls.length > 1 ? 's' : ''} uploaded</p>
                : <p className="text-xs text-red-500/70 mt-1">Required — attach your signed quotation</p>
              }
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
      </div>}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <p className="text-white text-sm font-medium truncate flex-1">{previewFile.split('/').pop()?.split('?')[0]}</p>
            <div className="flex items-center gap-3 shrink-0">
              <a href={previewFile} download target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300">⬇ Download</a>
              <button onClick={() => setPreviewFile(null)}
                className="text-zinc-400 hover:text-white text-xl leading-none">✕</button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            {/\.(jpg|jpeg|png|gif|webp)$/i.test(previewFile.split('?')[0]) ? (
              <img src={previewFile} alt="Preview" className="w-full h-full object-contain p-4" />
            ) : (
              <iframe src={previewFile} className="w-full h-full border-0" title="File Preview" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SubmitInvoiceModal({ po, token, onClose, onSubmitted }: {
  po: VendorPO;
  token: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [gstAmount, setGstAmount] = useState('0');
  const [tdsAmount, setTdsAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const net = (parseFloat(amount) || 0) + (parseFloat(gstAmount) || 0) - (parseFloat(tdsAmount) || 0);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    const r = await fetch('/api/upload', { method: 'POST', body: fd });
    if (r.ok) { const d = await r.json(); setFileUrl(d.url); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceNumber || !amount) return alert('Invoice number and amount are required');
    setSubmitting(true);
    const r = await fetch(`/api/vendor-portal/invoices?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        poId: po.id,
        invoiceNumber,
        amount: parseFloat(amount),
        gstAmount: parseFloat(gstAmount) || 0,
        tdsAmount: parseFloat(tdsAmount) || 0,
        fileUrl: fileUrl || undefined,
        notes: notes || undefined,
      }),
    });
    setSubmitting(false);
    if (r.ok) { onSubmitted(); }
    else { const e = await r.json(); alert(e.error ?? 'Submission failed'); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm">
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <h2 className="text-white font-semibold text-base">Submit Invoice</h2>
            <p className="text-zinc-500 text-xs mt-0.5">{po.poNumber} · ₹{po.totalAmount.toLocaleString('en-IN')}</p>
          </div>
          <div>
            <label className="text-xs text-zinc-400">Invoice Number *</label>
            <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} required
              placeholder="e.g. INV/2026/001"
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-400">Invoice Amount (₹) *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} min={0} step="0.01" required
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400">GST Amount (₹)</label>
              <input type="number" value={gstAmount} onChange={e => setGstAmount(e.target.value)} min={0} step="0.01"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div>
              <label className="text-xs text-zinc-400">TDS Amount (₹)</label>
              <input type="number" value={tdsAmount} onChange={e => setTdsAmount(e.target.value)} min={0} step="0.01"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
          </div>
          {amount && (
            <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Net Payable</span>
                <span className="text-white font-semibold">₹{net.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs text-zinc-400">Attach Invoice PDF (optional)</label>
            <input type="file" accept=".pdf,.jpg,.png" onChange={handleFileUpload}
              className="w-full mt-1 text-zinc-400 text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-700 file:text-white" />
            {fileUrl && <p className="text-xs text-sky-400 mt-1">Uploaded</p>}
          </div>
          <div>
            <label className="text-xs text-zinc-400">Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium disabled:opacity-50">
              {submitting ? 'Submitting...' : 'Submit Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
