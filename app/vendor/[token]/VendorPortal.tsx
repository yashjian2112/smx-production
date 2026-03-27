'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Package, Check, X } from 'lucide-react';

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

type POItem = { id: string; quantity: number; unitPrice: number; itemDescription?: string | null; itemUnit?: string | null; rawMaterial: { name: string; unit: string } | null };
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
  const [calOpen, setCalOpen] = useState(false);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const calRef = useRef<HTMLDivElement>(null);

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
      const fd = new FormData();
      fd.append('file', file);
      fd.append('token', token); // vendor auth via invite token
      const r = await fetch('/api/vendor-portal/upload', { method: 'POST', body: fd });
      if (r.ok) { const d = await r.json(); setFileUrls(prev => [...prev, d.url]); }
      else { const d = await r.json().catch(() => ({})); alert(d.error ?? 'Upload failed'); }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rfq) return;
    if (!leadTimeDays || !validUntil) return alert('Lead time and valid until date are required');
    if (!notes.trim()) return alert('Notes / Terms are required');
    const items = rfq.items.map(i => ({
      rfqItemId: i.id,
      materialId: i.materialId ?? null,
      unitPrice: parseFloat(itemPrices[i.id] ?? '0') || 0,
      qty: i.qtyRequired,
    }));
    if (items.some(i => i.unitPrice <= 0)) return alert('Enter price for all items');
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    // Without GST → add GST on top; With GST → price is already final inclusive
    const gstAmount = currency === 'INR' && gstType === 'without' ? subtotal * (parseFloat(gstPercent) || 0) / 100 : 0;
    const totalAmount = subtotal + gstAmount;
    const gstNote = currency === 'INR'
      ? (gstType === 'with' ? '[Prices quoted inclusive of GST]' : `[Prices excl. GST — GST @ ${gstPercent}% added: ₹${gstAmount.toFixed(2)} | Total incl. GST: ₹${totalAmount.toFixed(2)}]`)
      : '';
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
          <div className="text-4xl flex items-center justify-center"><AlertTriangle className="w-4 h-4" /></div>
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
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-white font-bold text-lg">SMX Drives</p>
          <p className="text-zinc-500 text-xs">Vendor RFQ Portal</p>
        </div>
        <p className="text-sm text-zinc-400 font-mono">{rfq.rfqNumber}</p>
      </div>

      <div className="px-6 pt-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1 mb-5 max-w-xs">
          <button onClick={() => setActiveTab('rfq')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${activeTab === 'rfq' ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
            RFQ / Quote
          </button>
          <button onClick={() => setActiveTab('pos')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${activeTab === 'pos' ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
            My POs
          </button>
        </div>
      </div>

      {activeTab === 'pos' && (
        <div className="px-4 pb-10 space-y-4 max-w-2xl mx-auto">
          {posLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
              <p className="text-zinc-500 text-sm">Loading purchase orders…</p>
            </div>
          ) : myPOs.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 p-10 text-center mt-4" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="text-4xl mb-3 flex items-center justify-center"><Package className="w-4 h-4" /></div>
              <p className="text-white font-medium">No Purchase Orders Yet</p>
              <p className="text-zinc-500 text-sm mt-1">When SMX issues a PO to you, it will appear here.</p>
            </div>
          ) : (
            <>
              <p className="text-zinc-500 text-xs pt-1">{myPOs.length} purchase order{myPOs.length !== 1 ? 's' : ''}</p>
              {myPOs.map(po => {
                const sym = po.currency === 'USD' ? '$' : '₹';
                const goodsReceived = ['GOODS_ARRIVED','PARTIALLY_RECEIVED','RECEIVED'].includes(po.status);
                const invoiceSubmitted = po.vendorInvoices.length > 0;
                const paymentRaised = !!po.paymentRequest;
                const isPaid = po.paymentStatus === 'PAID';
                const isPartialPaid = po.paymentStatus === 'PARTIAL';
                const canSubmitInvoice = goodsReceived && !invoiceSubmitted;

                // 6-step timeline
                const advancePaid = isPartialPaid || isPaid;
                const goodsChecked = po.status === 'RECEIVED';
                type Step = { label: string; sub: string | React.ReactNode; done: boolean; active: boolean };
                const steps: Step[] = [
                  {
                    label: 'PO Issued',
                    sub: new Date(po.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
                    done: true,
                    active: false,
                  },
                  {
                    label: 'Adv. Payment',
                    sub: advancePaid ? `${sym}${po.paidAmount.toLocaleString('en-IN')}` : paymentRaised ? 'Processing' : 'Pending',
                    done: advancePaid,
                    active: !advancePaid && paymentRaised,
                  },
                  {
                    label: 'Goods Received',
                    sub: goodsReceived ? (po.status === 'PARTIALLY_RECEIVED' ? 'Partial' : 'Arrived') : 'Pending',
                    done: goodsReceived,
                    active: !goodsReceived && advancePaid,
                  },
                  {
                    label: 'Goods Check',
                    sub: goodsChecked ? 'Verified' : goodsReceived ? 'In Progress' : 'Pending',
                    done: goodsChecked,
                    active: goodsReceived && !goodsChecked,
                  },
                  {
                    label: 'Payment',
                    sub: isPaid ? 'Paid' : invoiceSubmitted ? 'Processing' : 'Pending',
                    done: isPaid,
                    active: goodsChecked && invoiceSubmitted && !isPaid,
                  },
                  {
                    label: 'Completed',
                    sub: isPaid ? <><Check className="w-4 h-4 mr-1" /> Done</> : '—',
                    done: isPaid,
                    active: false,
                  },
                ];

                return (
                  <div key={po.id} className="rounded-2xl border border-zinc-800 overflow-hidden" style={{ background: 'rgb(18,18,20)' }}>
                    {/* Header */}
                    <div className="px-5 pt-5 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-white font-bold text-base">{po.poNumber}</span>
                            {po.status === 'PARTIALLY_RECEIVED' && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-300 border border-amber-700/30">Partial Delivery</span>
                            )}
                            {isPaid && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300 border border-emerald-700/30">Paid</span>
                            )}
                          </div>
                          {po.rfq && <p className="text-zinc-500 text-xs mt-0.5">{po.rfq.title} · {po.rfq.rfqNumber}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-white font-bold text-lg">{sym}{po.totalAmount.toLocaleString('en-IN')}</p>
                          <p className="text-zinc-500 text-xs">{po.currency}</p>
                        </div>
                      </div>

                      {/* Meta row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                        {po.rfq?.paymentTerms && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <span className="text-zinc-600">💳</span>
                            <span>{po.rfq.paymentTerms}</span>
                          </div>
                        )}
                        {po.expectedDelivery && (
                          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                            <span className="text-zinc-600">📅</span>
                            <span>ETA {new Date(po.expectedDelivery).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          </div>
                        )}
                        {(isPartialPaid || isPaid) && (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                            <Check className="w-4 h-4" />
                            <span>{sym}{po.paidAmount.toLocaleString('en-IN')} received</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Status Timeline */}
                    <div className="px-4 py-4 border-t border-zinc-800/80 overflow-x-auto" style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <div className="flex items-start min-w-[420px]">
                        {steps.map((step, idx) => (
                          <div key={idx} className="flex-1 flex flex-col items-center relative">
                            {/* Connector line left-half (from prev dot to this dot) */}
                            {idx > 0 && (
                              <div className="absolute top-[11px] right-1/2 w-full h-0.5 z-0"
                                style={{ background: step.done ? '#10b981' : step.active ? '#3b82f6' : '#27272a' }} />
                            )}
                            {/* Connector line right-half (from this dot to next dot) */}
                            {idx < steps.length - 1 && (
                              <div className="absolute top-[11px] left-1/2 w-full h-0.5 z-0"
                                style={{ background: steps[idx + 1].done ? '#10b981' : steps[idx + 1].active ? '#3b82f6' : '#27272a' }} />
                            )}
                            {/* Circle */}
                            <div className={`relative z-10 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all shrink-0 ${
                              step.done
                                ? 'bg-emerald-500 border-emerald-500 text-white'
                                : step.active
                                  ? 'bg-sky-950 border-sky-400 text-sky-300'
                                  : 'bg-zinc-900 border-zinc-700 text-zinc-600'
                            }`}>
                              {step.done ? <Check className="w-4 h-4" /> : idx + 1}
                            </div>
                            {/* Label */}
                            <p className={`text-[10px] font-semibold mt-1.5 text-center leading-tight px-0.5 ${step.done ? 'text-emerald-400' : step.active ? 'text-sky-400' : 'text-zinc-600'}`}>
                              {step.label}
                            </p>
                            <p className={`text-[9px] mt-0.5 text-center leading-tight px-0.5 ${step.done ? 'text-zinc-400' : step.active ? 'text-sky-600' : 'text-zinc-700'}`}>
                              {step.sub}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Items */}
                    {po.items.length > 0 && (
                      <div className="border-t border-zinc-800/80">
                        <div className="px-5 py-3">
                          <p className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider mb-2">Order Items</p>
                          <div className="space-y-1.5">
                            {po.items.map((item, idx) => (
                              <div key={item.id} className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-zinc-700 text-xs w-4 shrink-0">{idx + 1}.</span>
                                  <span className="text-zinc-300 text-xs truncate">{item.rawMaterial?.name ?? item.itemDescription ?? 'Item'}</span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-zinc-400 text-xs">{item.quantity} {item.rawMaterial?.unit ?? item.itemUnit ?? 'pcs'}</span>
                                  <span className="text-zinc-600 text-xs ml-2">@ {sym}{item.unitPrice.toLocaleString('en-IN')}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Invoices */}
                    {po.vendorInvoices.length > 0 && (
                      <div className="border-t border-zinc-800/80 px-5 py-3">
                        <p className="text-zinc-500 text-[11px] font-medium uppercase tracking-wider mb-2">Your Invoice</p>
                        {po.vendorInvoices.map(inv => (
                          <div key={inv.id} className="flex items-center justify-between">
                            <div>
                              <p className="text-zinc-300 text-xs font-mono">{inv.invoiceNumber}</p>
                              <p className="text-zinc-600 text-[10px] mt-0.5">{new Date(inv.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-white text-xs font-medium">{sym}{inv.netAmount.toLocaleString('en-IN')} <span className="text-zinc-500 font-normal">net</span></p>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                inv.status === 'PAID' ? 'bg-emerald-900/40 text-emerald-300' :
                                inv.status === 'PENDING' ? 'bg-amber-900/40 text-amber-300' :
                                'bg-zinc-800 text-zinc-400'
                              }`}>{inv.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Payment Request Status */}
                    {po.paymentRequest && !isPaid && (
                      <div className="border-t border-zinc-800/80 px-5 py-3 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse shrink-0" />
                        <p className="text-violet-400 text-xs">
                          Payment request {po.paymentRequest.requestNumber} — {po.paymentRequest.status.replace(/_/g, ' ')}
                        </p>
                      </div>
                    )}

                    {/* Action Footer */}
                    {canSubmitInvoice && (
                      <div className="border-t border-zinc-800 px-5 py-3">
                        <button onClick={() => setInvoiceModal(po)}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-500 text-white transition-colors flex items-center justify-center gap-2">
                          <span>📄</span> Submit Your Invoice
                        </button>
                        <p className="text-zinc-600 text-[10px] text-center mt-1.5">Goods have been received — you can now submit your invoice</p>
                      </div>
                    )}
                    {isPaid && (
                      <div className="border-t border-emerald-900/30 px-5 py-3 flex items-center justify-center gap-2">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <p className="text-emerald-400 text-sm font-medium">Payment complete</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
          {invoiceModal && (
            <SubmitInvoiceModal po={invoiceModal} token={token} onClose={() => setInvoiceModal(null)} onSubmitted={() => { setInvoiceModal(null); loadPOs(); }} />
          )}
        </div>
      )}

      {activeTab === 'rfq' && <div className="px-6 pt-0 space-y-5">
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
            <p className="text-emerald-400 font-medium flex items-center"><Check className="w-4 h-4 mr-1 inline" /> Quote submitted successfully!</p>
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
          <form onSubmit={submit} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-6">
            <p className="text-white font-semibold text-lg">Submit Your Quote</p>

            {/* Currency + GST toggle side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Currency *</label>
                <select value={currency} onChange={e => { setCurrency(e.target.value); if (e.target.value !== 'INR') setGstType('without'); }}
                  className="w-full mt-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-3 text-white text-sm focus:outline-none focus:border-sky-500">
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>
              {currency === 'INR' && (
                <div className="sm:col-span-2">
                  <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Prices are *</label>
                  <div className="flex mt-2 rounded-lg overflow-hidden border border-zinc-700">
                    <button type="button" onClick={() => setGstType('with')}
                      className={`flex-1 py-3 text-sm font-medium transition-colors ${gstType === 'with' ? 'bg-sky-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                      With GST (final price)
                    </button>
                    <button type="button" onClick={() => setGstType('without')}
                      className={`flex-1 py-3 text-sm font-medium transition-colors ${gstType === 'without' ? 'bg-sky-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
                      Without GST (add GST)
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* GST rate — only when WITHOUT GST (we need to add it on top) */}
            {currency === 'INR' && gstType === 'without' && (
              <div>
                <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">GST Rate to Add *</label>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {['5', '12', '18', '28'].map(p => (
                    <button key={p} type="button" onClick={() => setGstPercent(p)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${gstPercent === p ? 'bg-sky-600 border-sky-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'}`}>
                      {p}%
                    </button>
                  ))}
                  <div className="flex items-center gap-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3">
                    <input type="number" min={0} max={100} step="0.1"
                      value={gstPercent} onChange={e => setGstPercent(e.target.value)}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      className="w-14 bg-transparent text-white text-sm text-center focus:outline-none py-2"
                      placeholder="0" />
                    <span className="text-zinc-500 text-sm">%</span>
                  </div>
                </div>
                <p className="text-xs text-zinc-500 mt-1">GST will be added on top of the prices you enter below</p>
              </div>
            )}
            {currency === 'INR' && gstType === 'with' && (
              <p className="text-xs text-zinc-500 -mt-2">Enter your final inclusive prices below — GST is already included in what you quote</p>
            )}

            {/* Per-piece pricing table */}
            <div>
              <label className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                Price per Piece *{currency === 'INR' && gstType === 'without' && <span className="text-zinc-600 font-normal normal-case ml-1">(excl. GST)</span>}
                {currency === 'INR' && gstType === 'with' && <span className="text-zinc-600 font-normal normal-case ml-1">(incl. GST — final price)</span>}
              </label>

              {/* Table header */}
              <div className="mt-3 grid grid-cols-12 gap-2 text-xs text-zinc-500 px-1 mb-1">
                <span className="col-span-5">Item</span>
                <span className="col-span-2 text-center">Qty</span>
                <span className="col-span-2 text-right">Price/pc</span>
                <span className="col-span-3 text-right">Amount</span>
              </div>

              <div className="space-y-2">
                {rfq.items.map(item => {
                  const priceVal = parseFloat(itemPrices[item.id] ?? '0') || 0;
                  const lineBase = priceVal * (item.qtyRequired || 0);
                  const sym = currency === 'USD' ? '$' : '₹';
                  return (
                    <div key={item.id} className="grid grid-cols-12 gap-2 items-center bg-zinc-800/50 rounded-lg px-3 py-2.5">
                      <div className="col-span-5">
                        <p className="text-sm text-zinc-200 font-medium">{item.material?.name ?? item.itemDescription ?? 'Item'}</p>
                        {item.material?.code && <p className="text-xs text-zinc-500">{item.material.code}</p>}
                      </div>
                      <div className="col-span-2 text-center">
                        <span className="text-sm text-zinc-300">{item.qtyRequired}</span>
                        <span className="text-xs text-zinc-500 ml-1">{item.material?.unit ?? item.itemUnit ?? 'pc'}</span>
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <span className="text-zinc-500 text-xs">{sym}</span>
                        <input type="number" min={0} step="0.01" placeholder="0.00"
                          value={itemPrices[item.id] ?? ''}
                          onChange={e => setItemPrices(p => ({ ...p, [item.id]: e.target.value }))}
                          onWheel={e => (e.target as HTMLInputElement).blur()}
                          className="w-24 bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-sky-500" />
                      </div>
                      <div className="col-span-3 text-right">
                        <p className="text-sm text-white font-medium">{sym}{lineBase.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                        {priceVal > 0 && <p className="text-xs text-zinc-500">{sym}{priceVal.toFixed(2)} × {item.qtyRequired}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Summary */}
              {(() => {
                const sym = currency === 'USD' ? '$' : '₹';
                const subtotal = rfq.items.reduce((s, i) => s + (parseFloat(itemPrices[i.id] ?? '0') || 0) * (i.qtyRequired || 0), 0);
                // Without GST: add GST on top; With GST: price is already final
                const gstAmt = currency === 'INR' && gstType === 'without' ? subtotal * (parseFloat(gstPercent) || 0) / 100 : 0;
                const total = subtotal + gstAmt;
                return (
                  <div className="mt-3 rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-3 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-400">Subtotal ({rfq.items.length} item{rfq.items.length !== 1 ? 's' : ''})</span>
                      <span className="text-zinc-200">{sym}{subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {currency === 'INR' && gstType === 'without' && (
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">GST @ {gstPercent}%</span>
                        <span className="text-amber-400">+ {sym}{gstAmt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {currency === 'INR' && gstType === 'with' && (
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">GST included in above prices</span>
                        <span className="text-zinc-500">—</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold pt-2 border-t border-zinc-600">
                      <span className="text-white">Total Quote Value</span>
                      <span className="text-sky-400">{sym}{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                );
              })()}
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
              <div ref={calRef} className="relative">
                <label className="text-xs text-zinc-400">Quote Valid Until *</label>
                <button type="button" onClick={() => setCalOpen(o => !o)}
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-left text-sm focus:outline-none focus:border-sky-500 flex items-center justify-between">
                  <span className={validUntil ? 'text-white' : 'text-zinc-500'}>
                    {validUntil ? new Date(validUntil + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Select date'}
                  </span>
                  <span className="text-zinc-400 text-base">📅</span>
                </button>
                {calOpen && (
                  <div className="absolute top-full left-0 mt-1 z-30 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-4 w-72">
                    {/* Month nav */}
                    <div className="flex items-center justify-between mb-3">
                      <button type="button" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}
                        className="text-zinc-400 hover:text-white px-2 py-1 rounded">‹</button>
                      <span className="text-white text-sm font-semibold">
                        {new Date(calYear, calMonth).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                      </span>
                      <button type="button" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}
                        className="text-zinc-400 hover:text-white px-2 py-1 rounded">›</button>
                    </div>
                    {/* Day labels */}
                    <div className="grid grid-cols-7 mb-1">
                      {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                        <span key={d} className="text-center text-xs text-zinc-500 py-1">{d}</span>
                      ))}
                    </div>
                    {/* Day grid */}
                    {(() => {
                      const today = new Date(); today.setHours(0,0,0,0);
                      const firstDay = new Date(calYear, calMonth, 1).getDay();
                      const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
                      const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_,i) => i+1)];
                      while (cells.length % 7 !== 0) cells.push(null);
                      const selParts = validUntil ? validUntil.split('-').map(Number) : null;
                      return (
                        <div className="grid grid-cols-7 gap-0.5">
                          {cells.map((d, i) => {
                            if (!d) return <span key={i} />;
                            const date = new Date(calYear, calMonth, d);
                            const isPast = date < today;
                            const isSelected = selParts && selParts[0] === calYear && selParts[1]-1 === calMonth && selParts[2] === d;
                            const isToday = date.getTime() === today.getTime();
                            return (
                              <button key={i} type="button" disabled={isPast}
                                onClick={() => {
                                  const mm = String(calMonth + 1).padStart(2, '0');
                                  const dd = String(d).padStart(2, '0');
                                  setValidUntil(`${calYear}-${mm}-${dd}`);
                                  setCalOpen(false);
                                }}
                                className={`w-full aspect-square rounded-lg text-sm font-medium transition-colors
                                  ${isPast ? 'text-zinc-700 cursor-not-allowed' : 'hover:bg-zinc-700 cursor-pointer'}
                                  ${isSelected ? 'bg-sky-600 text-white hover:bg-sky-500' : ''}
                                  ${isToday && !isSelected ? 'border border-sky-600 text-sky-400' : ''}
                                  ${!isSelected && !isToday && !isPast ? 'text-zinc-300' : ''}
                                `}>
                                {d}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {/* Quick picks */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-700/50 flex-wrap">
                      {[15, 30, 45, 60, 90].map(days => {
                        const d = new Date(); d.setDate(d.getDate() + days);
                        const iso = d.toISOString().split('T')[0];
                        return (
                          <button key={days} type="button"
                            onClick={() => { setValidUntil(iso); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); setCalOpen(false); }}
                            className="text-xs px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 border border-zinc-700">
                            +{days}d
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-400">Notes / Terms *</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} required
                placeholder="Payment terms, warranty, delivery conditions, validity..."
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-blue-500" />
            </div>

            {/* Attachment — optional, PDF or PNG only */}
            <div>
              <label className="text-xs text-zinc-400">Attach Quotation <span className="text-zinc-600">(optional — PDF or PNG)</span></label>
              <input type="file" accept=".pdf,.png" multiple onChange={handleFileUpload}
                className="w-full mt-1 text-zinc-400 text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-zinc-700 file:text-white hover:file:bg-zinc-600 cursor-pointer" />
              {fileUrls.length > 0 && (
                <p className="text-xs text-blue-400 mt-1 flex items-center"><Check className="w-4 h-4 mr-1 inline" />{fileUrls.length} file{fileUrls.length > 1 ? 's' : ''} attached</p>
              )}
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
                className="text-zinc-400 hover:text-white text-xl leading-none"><X className="w-4 h-4" /></button>
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
    const fd = new FormData();
    fd.append('file', file);
    fd.append('token', token); // vendor auth via invite token
    const r = await fetch('/api/vendor-portal/upload', { method: 'POST', body: fd });
    if (r.ok) { const d = await r.json(); setFileUrl(d.url); }
    else { const d = await r.json().catch(() => ({})); alert(d.error ?? 'Upload failed'); }
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
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400">GST Amount (₹)</label>
              <input type="number" value={gstAmount} onChange={e => setGstAmount(e.target.value)} min={0} step="0.01"
                onWheel={(e) => e.currentTarget.blur()}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-sky-500" />
            </div>
            <div>
              <label className="text-xs text-zinc-400">TDS Amount (₹)</label>
              <input type="number" value={tdsAmount} onChange={e => setTdsAmount(e.target.value)} min={0} step="0.01"
                onWheel={(e) => e.currentTarget.blur()}
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
