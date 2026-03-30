'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Client  = { id: string; code: string; customerName: string; globalOrIndian: string | null; gstNumber: string | null; state: string | null };
type Product = { id: string; code: string; name: string };

type LineItem = {
  key:             number;
  description:     string;
  productId:       string;
  hsnCode:         string;
  quantity:        number;
  unitPrice:       number;
  discountPercent: number;
  voltageFrom:     string;
  voltageTo:       string;
};

const HSN_OPTIONS = [
  { value: '85371000', label: '85371000 — Controller' },
  { value: '85015290', label: '85015290 — Motor' },
  { value: '85285200', label: '85285200 — Display' },
  { value: '9965',     label: '9965 — Shipping / Freight' },
  { value: 'custom',   label: 'Other (type below)' },
];

const PAYMENT_PRESETS = ['100% ADVANCE', '50% Advance, 50% on delivery', '30 days net', 'LC at sight'];

let keyCounter = 3;

function newItem(): LineItem {
  return { key: ++keyCounter, description: '', productId: '', hsnCode: '85371000', quantity: 1, unitPrice: 0, discountPercent: 0, voltageFrom: '', voltageTo: '' };
}

function calcAmount(item: LineItem) {
  return item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
}

const lCls  = 'block text-[11px] font-medium text-zinc-500 tracking-widest uppercase mb-1.5';
const iCls  = 'input-field text-sm w-full';
const sCls  = 'select-field text-sm w-full';

export function CreateProformaForm({ clients, products, role }: { clients: Client[]; products: Product[]; role?: string }) {
  const router = useRouter();

  // ─── State ───────────────────────────────────────────────────────
  const [documentType,     setDocumentType]     = useState<'PROFORMA' | 'INVOICE'>('PROFORMA');
  const [invoiceType,      setInvoiceType]      = useState<'SALE' | 'RETURN' | 'REPLACEMENT'>('SALE');
  const [clientId,         setClientId]         = useState('');
  const [currency,         setCurrency]         = useState<'INR' | 'USD'>('INR');
  const [termsOfPayment,   setTermsOfPayment]   = useState('100% ADVANCE');
  const [deliveryDays,     setDeliveryDays]     = useState('');
  const [notes,            setNotes]            = useState('');
  const [shippingCharges,  setShippingCharges]  = useState('');
  // Split invoice
  const [splitInvoice,        setSplitInvoice]        = useState(false);
  const [splitServicePercent, setSplitServicePercent] = useState('');
  // Replacement-specific fields
  const [unitSerial,       setUnitSerial]       = useState('');
  const [problemDesc,      setProblemDesc]      = useState('');

  const [items, setItems] = useState<LineItem[]>([
    { key: 1, description: '', productId: '', hsnCode: '85371000', quantity: 1, unitPrice: 0, discountPercent: 0, voltageFrom: '', voltageTo: '' },
  ]);
  const [hsnInputs, setHsnInputs] = useState<Record<number, string>>({});  // custom HSN per item

  const [exchangeRate,     setExchangeRate]     = useState<number | ''>('');
  const [rateLoading,      setRateLoading]      = useState(false);
  const [dualCurrency,     setDualCurrency]     = useState(false); // USD-INR mode

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // ─── Live rate fetch ──────────────────────────────────────────────
  const fetchLiveRate = useCallback(async () => {
    setRateLoading(true);
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await res.json();
      if (data?.rates?.INR) setExchangeRate(Math.round(data.rates.INR * 100) / 100);
    } catch { /* leave blank if unavailable */ }
    finally { setRateLoading(false); }
  }, []);

  // ─── Derived ─────────────────────────────────────────────────────
  const selectedClient = clients.find((c) => c.id === clientId);
  const isGlobal = selectedClient?.globalOrIndian === 'Global';
  const rate = typeof exchangeRate === 'number' ? exchangeRate : 0;

  // Auto-set currency when client changes
  function handleClientChange(id: string) {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c) {
      if (c.globalOrIndian === 'Global') {
        // Export client → USD only (no dual)
        setCurrency('USD');
        setDualCurrency(false);
        setExchangeRate('');
      } else {
        // Domestic client → INR default
        setCurrency('INR');
        setDualCurrency(false);
        setExchangeRate('');
      }
    }
  }

  function handleCurrencyChange(c: 'INR' | 'USD' | 'USD-INR') {
    if (c === 'USD-INR') {
      setCurrency('USD');
      setDualCurrency(true);
      if (!exchangeRate) fetchLiveRate();
    } else {
      setCurrency(c);
      setDualCurrency(false);
      if (c === 'INR') { setExchangeRate(''); }
    }
  }

  // ─── Line Item helpers ────────────────────────────────────────────
  function addItem() { setItems((prev) => [...prev, newItem()]); }
  function removeItem(key: number) { setItems((prev) => prev.filter((i) => i.key !== key)); }

  function updateItem(key: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((i) => i.key === key ? { ...i, ...patch } : i));
  }

  function handleProductSelect(key: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (p) {
      updateItem(key, {
        productId,
        description: p.name,
        hsnCode: '85371000',
      });
    } else {
      updateItem(key, { productId: '' });
    }
  }

  function handleHsnSelect(key: number, val: string) {
    if (val === 'custom') {
      setHsnInputs((prev) => ({ ...prev, [key]: '' }));
      updateItem(key, { hsnCode: '' });
    } else {
      setHsnInputs((prev) => { const n = { ...prev }; delete n[key]; return n; });
      updateItem(key, { hsnCode: val });
    }
  }

  // ─── Totals ──────────────────────────────────────────────────────
  const subtotal       = items.reduce((s, i) => s + calcAmount(i), 0);
  const shipping       = parseFloat(shippingCharges) || 0;
  // isExport: client-based when selected, currency-based when no client chosen yet
  const isExport       = selectedClient ? isGlobal : currency === 'USD';
  const sellerState    = 'gujarat';
  const buyerState     = (selectedClient?.state ?? '').toLowerCase();
  const isIntra        = !isExport && !!buyerState && buyerState === sellerState;
  const gst            = isExport ? 0 : subtotal * 0.18;
  const total          = subtotal + gst + shipping;

  const fmtAmt = (n: number) => currency === 'USD'
    ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const fmtInr = (usd: number) => rate > 0
    ? `₹${(usd * rate).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    : null;

  // ─── Submit ──────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { setError('Please select a client'); return; }
    if (items.some((i) => !i.hsnCode || i.unitPrice <= 0)) {
      setError('Fill in all line items (HSN code, price)');
      return;
    }
    if (items.some((i) => !i.voltageFrom || !i.voltageTo)) {
      setError('Please enter voltage range (From and To) for all line items');
      return;
    }
    if (invoiceType === 'REPLACEMENT' && (!unitSerial.trim() || !problemDesc.trim())) {
      setError('Please fill in Unit Serial Number and Problem Description for replacement');
      return;
    }
    setError('');
    setLoading(true);

    // Build notes
    let finalNotes = notes.trim();
    if (invoiceType === 'REPLACEMENT') {
      finalNotes = `[REPLACEMENT]\nSerial: ${unitSerial.trim()}\nProblem: ${problemDesc.trim()}${finalNotes ? '\n' + finalNotes : ''}`;
    }

    // Build items (add shipping as line item if > 0)
    const submitItems = items.map((item, i) => ({
      description:     item.description,
      productId:       item.productId || undefined,
      hsnCode:         item.hsnCode,
      quantity:        item.quantity,
      unitPrice:       item.unitPrice,
      discountPercent: item.discountPercent,
      voltageFrom:     item.voltageFrom || undefined,
      voltageTo:       item.voltageTo || undefined,
      sortOrder:       i,
    }));
    if (shipping > 0) {
      submitItems.push({
        description:     'Freight & Forwarding Charges',
        productId:       undefined,
        hsnCode:         '9965',
        quantity:        1,
        unitPrice:       shipping,
        discountPercent: 0,
        voltageFrom:     undefined,
        voltageTo:       undefined,
        sortOrder:       submitItems.length,
      });
    }

    try {
      const res = await fetch('/api/proformas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          documentType: invoiceType === 'SALE' ? documentType : 'PROFORMA',
          invoiceType,
          currency,
          exchangeRate:    currency === 'USD' && rate > 0 ? rate : undefined,
          termsOfPayment:  termsOfPayment || undefined,
          deliveryDays:    deliveryDays ? parseInt(deliveryDays, 10) : undefined,
          notes:           finalNotes || undefined,
          items:           submitItems,
          splitInvoice:    splitInvoice || undefined,
          splitServicePercent: splitInvoice && splitServicePercent ? parseFloat(splitServicePercent) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Failed to create invoice'); setLoading(false); return; }
      router.push(`/sales/${data.id}`);
    } catch { setError('Network error'); setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-12">

      {error && (
        <div className="p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* Document Type — hidden for SALES (they can only create Proforma Invoices) */}
      {role !== 'SALES' && (
        <div>
          <label className={lCls}>Document Type</label>
          <div className="flex gap-2">
            {([['PROFORMA', 'Proforma Invoice (PI)'], ['INVOICE', 'Invoice']] as const).map(([val, label]) => (
              <button key={val} type="button" onClick={() => setDocumentType(val)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={documentType === val
                  ? { background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8' }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#71717a' }}>
                {label}
              </button>
            ))}
          </div>
          {documentType === 'INVOICE' && (
            <p className="text-[10px] text-zinc-500 mt-1">
              Export clients → <span className="font-mono">TSM/ES/YY-YY/0001</span> &nbsp;·&nbsp; Indian clients → <span className="font-mono">TSM/DS/YY-YY/0001</span>
            </p>
          )}
        </div>
      )}

      {/* Invoice Type — SALES can only create Sale PIs (Returns/Replacements via rework flow) */}
      {role !== 'SALES' && (
        <div>
          <label className={lCls}>Invoice Type</label>
          <div className="flex gap-2">
            {(['SALE', 'RETURN', 'REPLACEMENT'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setInvoiceType(t)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={invoiceType === t
                  ? { background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8' }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#71717a' }}>
                {t[0] + t.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Replacement fields */}
      {invoiceType === 'REPLACEMENT' && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}>
          <p className="text-xs font-medium text-amber-400">Replacement Details</p>
          <div>
            <label className={lCls}>Unit Serial Number <span className="text-red-400">*</span></label>
            <input
              value={unitSerial}
              onChange={(e) => setUnitSerial(e.target.value.toUpperCase())}
              className={iCls}
              placeholder="e.g. SMX100026001"
            />
          </div>
          <div>
            <label className={lCls}>Problem / Customer Complaint <span className="text-red-400">*</span></label>
            <textarea
              value={problemDesc}
              onChange={(e) => setProblemDesc(e.target.value)}
              className={`${iCls} resize-none`}
              rows={3}
              placeholder="Describe the issue reported by customer…"
            />
          </div>
        </div>
      )}

      {/* Client */}
      <div>
        <label className={lCls}>Client <span className="text-red-400">*</span></label>
        <select value={clientId} onChange={(e) => handleClientChange(e.target.value)} className={sCls} required>
          <option value="">— Select client —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.customerName} ({c.code}){c.globalOrIndian ? ` · ${c.globalOrIndian}` : ''}</option>
          ))}
        </select>
        {selectedClient?.gstNumber && (
          <p className="text-xs text-zinc-600 mt-1">GST: {selectedClient.gstNumber}</p>
        )}
      </div>

      {/* Currency */}
      <div className="space-y-3">
        <div>
          <label className={lCls}>Currency</label>
          <div className="flex gap-2">
            {/* Domestic: INR + USD-INR | Global/Export: USD only */}
            {(isGlobal
              ? (['USD'] as const)
              : (['INR', 'USD-INR'] as const)
            ).map((c) => {
              const isActive = c === 'USD-INR' ? dualCurrency : (currency === c && !dualCurrency);
              return (
                <button key={c} type="button" onClick={() => handleCurrencyChange(c)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={isActive
                    ? { background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#71717a' }}>
                  {c}
                </button>
              );
            })}
          </div>
          {dualCurrency && (
            <p className="text-[10px] text-zinc-600 mt-1">Enter prices in USD — INR equivalent shown for reference</p>
          )}
        </div>

        {/* Exchange rate — only in USD-INR dual mode */}
        {dualCurrency && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.15)' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sky-400">USD → INR Rate</span>
              <button
                type="button"
                onClick={fetchLiveRate}
                disabled={rateLoading}
                className="text-[10px] px-2 py-0.5 rounded-full border text-sky-500 hover:text-sky-300 transition-colors"
                style={{ borderColor: 'rgba(56,189,248,0.3)' }}
              >
                {rateLoading ? 'Fetching…' : 'Refresh live rate'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-xs shrink-0">1 USD =</span>
              <input
                type="number"
                min={1}
                step="0.01"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(parseFloat(e.target.value) || '')}
                onWheel={(e) => e.currentTarget.blur()}
                className={iCls + ' !w-28'}
                placeholder="e.g. 84.50"
              />
              <span className="text-zinc-500 text-xs shrink-0">INR</span>
            </div>
            {rate > 0 && (
              <p className="text-[10px] text-zinc-600">
                Prices entered in USD · INR equivalent shown for reference
              </p>
            )}
          </div>
        )}
      </div>

      {/* Terms of Payment */}
      <div>
        <label className={lCls}>Terms of Payment</label>
        <input value={termsOfPayment} onChange={(e) => setTermsOfPayment(e.target.value)} className={iCls} placeholder="e.g. 100% ADVANCE" />
        <div className="flex gap-1.5 mt-1.5 flex-wrap">
          {PAYMENT_PRESETS.map((p) => (
            <button key={p} type="button" onClick={() => setTermsOfPayment(p)}
              className="text-[10px] px-2 py-0.5 rounded-full border text-zinc-500 hover:text-zinc-300 transition-colors"
              style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Delivery Days */}
      <div>
        <label className={lCls}>Delivery Days <span className="normal-case text-zinc-600 font-normal text-[10px]">(days after receiving payment)</span></label>
        <input type="number" min={1} value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} onWheel={(e) => e.currentTarget.blur()} className={iCls} placeholder="e.g. 30" />
      </div>

      {/* ── Split Invoice — global/export clients only ── */}
      {isGlobal && <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.03)' }}>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            className="relative w-10 h-5 rounded-full transition-colors shrink-0"
            style={{ background: splitInvoice ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.1)' }}
            onClick={() => setSplitInvoice(!splitInvoice)}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
              style={{ transform: splitInvoice ? 'translateX(22px)' : 'translateX(2px)' }}
            />
          </div>
          <span className="text-sm text-zinc-300">
            {splitInvoice ? 'Split into Goods + Service invoices' : 'Split Invoice (off)'}
          </span>
        </label>

        {splitInvoice && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500 w-28 shrink-0">Service %</label>
              <input
                type="number" min={1} max={99}
                value={splitServicePercent}
                onChange={(e) => setSplitServicePercent(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
                className={iCls + ' !w-24'}
                placeholder="e.g. 30"
              />
              <span className="text-xs text-zinc-500">%</span>
            </div>
            {(() => {
              const svcPct = parseFloat(splitServicePercent);
              if (!svcPct || svcPct <= 0 || svcPct >= 100) return null;
              const goodsPct = 100 - svcPct;
              const goodsAmt = total * (goodsPct / 100);
              const serviceAmt = total * (svcPct / 100);
              return (
                <div className="space-y-1">
                  <div className="flex gap-4 text-xs">
                    <span style={{ color: '#4ade80' }}>Goods {goodsPct.toFixed(0)}% = {fmtAmt(goodsAmt)}</span>
                    <span style={{ color: '#fbbf24' }}>Service {svcPct.toFixed(0)}% = {fmtAmt(serviceAmt)}</span>
                  </div>
                  <p className="text-[10px] text-zinc-600">Split calculated on total ({fmtAmt(total)}) incl. GST + shipping</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>}

      {/* ── Line Items ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={lCls} style={{ marginBottom: 0 }}>Line Items</label>
          <button type="button" onClick={addItem}
            className="text-xs px-3 py-1 rounded-lg text-sky-400 border border-sky-500/30 hover:bg-sky-500/10 transition-colors">
            + Add Row
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={item.key} className="rounded-xl border border-zinc-800 p-3 space-y-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-500">Item {idx + 1}</span>
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(item.key)} className="text-red-400 text-xs hover:text-red-300">
                    Remove
                  </button>
                )}
              </div>

              {/* Product select */}
              <div>
                <label className={lCls}>Product (from catalogue)</label>
                <select value={item.productId} onChange={(e) => handleProductSelect(item.key, e.target.value)} className={sCls}>
                  <option value="">— Custom / manual entry —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className={lCls}>Description</label>
                <input value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} className={iCls} placeholder="Controller / Motor / Display description…" />
              </div>

              {/* HSN Code */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lCls}>HSN Code <span className="text-red-400">*</span></label>
                  <select
                    value={item.key in hsnInputs ? 'custom' : item.hsnCode}
                    onChange={(e) => handleHsnSelect(item.key, e.target.value)}
                    className={sCls}
                  >
                    {HSN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {item.key in hsnInputs && (
                    <input
                      className={`${iCls} mt-1.5`}
                      placeholder="Enter HSN code…"
                      value={hsnInputs[item.key]}
                      onChange={(e) => {
                        setHsnInputs((prev) => ({ ...prev, [item.key]: e.target.value }));
                        updateItem(item.key, { hsnCode: e.target.value });
                      }}
                    />
                  )}
                </div>

                {/* Quantity */}
                <div>
                  <label className={lCls}>Qty (PCS) <span className="text-red-400">*</span></label>
                  <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: parseInt(e.target.value, 10) || 1 })} onWheel={(e) => e.currentTarget.blur()} className={iCls} />
                </div>
              </div>

              {/* Voltage Range */}
              <div>
                <label className={lCls}>Voltage Range <span className="text-red-400">*</span></label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={item.voltageFrom} onChange={(e) => updateItem(item.key, { voltageFrom: e.target.value })} onWheel={(e) => e.currentTarget.blur()} className={iCls} placeholder="From (e.g. 48)" required />
                  <span className="text-zinc-500 text-sm shrink-0">to</span>
                  <input type="number" min={0} value={item.voltageTo} onChange={(e) => updateItem(item.key, { voltageTo: e.target.value })} onWheel={(e) => e.currentTarget.blur()} className={iCls} placeholder="To (e.g. 120)" required />
                  <span className="text-zinc-500 text-xs shrink-0">V</span>
                </div>
              </div>

              {/* Price + Discount + Amount */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lCls}>Unit Price ({currency === 'USD' ? '$' : '₹'}) <span className="text-red-400">*</span></label>
                  <input type="number" min={0} step="0.01" value={item.unitPrice || ''} onChange={(e) => updateItem(item.key, { unitPrice: parseFloat(e.target.value) || 0 })} onWheel={(e) => e.currentTarget.blur()} className={iCls} placeholder="0.00" required />
                </div>
                <div>
                  <label className={lCls}>Discount %</label>
                  <input type="number" min={0} max={100} step="0.01" value={item.discountPercent || ''} onChange={(e) => updateItem(item.key, { discountPercent: parseFloat(e.target.value) || 0 })} onWheel={(e) => e.currentTarget.blur()} className={iCls} placeholder="0" />
                </div>
                <div>
                  <label className={lCls}>Amount</label>
                  <div className="input-field text-sm text-zinc-400 select-none space-y-0.5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div>{currency === 'USD' ? '$' : '₹'}{calcAmount(item).toLocaleString(currency === 'USD' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}</div>
                    {dualCurrency && fmtInr(calcAmount(item)) && (
                      <div className="text-[10px] text-zinc-600">{fmtInr(calcAmount(item))}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Shipping Charges */}
      <div>
        <label className={lCls}>Shipping Charges <span className="normal-case text-zinc-600 font-normal text-[10px]">(optional — HSN 9965)</span></label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={shippingCharges}
          onChange={(e) => setShippingCharges(e.target.value)}
          onWheel={(e) => e.currentTarget.blur()}
          className={iCls}
          placeholder="0.00"
        />
      </div>

      {/* ── Totals Summary ── */}
      {items.length > 0 && (
        <div className="rounded-xl border border-zinc-800 p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
          {/* Column headers when dual currency */}
          {dualCurrency && rate > 0 && (
            <div className="flex justify-between text-[10px] text-zinc-600 pb-1 border-b border-zinc-800">
              <span></span>
              <div className="flex gap-6">
                <span className="w-24 text-right">USD</span>
                <span className="w-24 text-right">INR equiv.</span>
              </div>
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Sub Total</span>
            <div className="flex gap-6">
              <span className={dualCurrency && rate > 0 ? 'w-24 text-right' : ''}>{fmtAmt(subtotal)}</span>
              {dualCurrency && rate > 0 && <span className="w-24 text-right text-zinc-600">{fmtInr(subtotal)}</span>}
            </div>
          </div>
          {!isExport && isIntra && (
            <>
              <div className="flex justify-between text-sm text-zinc-500"><span>CGST 9%</span><span>{fmtAmt(subtotal * 0.09)}</span></div>
              <div className="flex justify-between text-sm text-zinc-500"><span>SGST 9%</span><span>{fmtAmt(subtotal * 0.09)}</span></div>
            </>
          )}
          {!isExport && !isIntra && (
            <div className="flex justify-between text-sm text-zinc-500"><span>IGST 18%</span><span>{fmtAmt(gst)}</span></div>
          )}
          {shipping > 0 && (
            <div className="flex justify-between text-sm text-zinc-500">
              <span>Shipping</span>
              <div className="flex gap-6">
                <span className={dualCurrency && rate > 0 ? 'w-24 text-right' : ''}>{fmtAmt(shipping)}</span>
                {dualCurrency && rate > 0 && <span className="w-24 text-right text-zinc-600">{fmtInr(shipping)}</span>}
              </div>
            </div>
          )}
          <div className="flex justify-between text-sm font-semibold border-t border-zinc-800 pt-2">
            <span>Total</span>
            <div className="flex gap-6 items-baseline">
              <span className={`text-sky-400${isExport && rate > 0 ? ' w-24 text-right' : ''}`}>{fmtAmt(total)}</span>
              {dualCurrency && rate > 0 && (
                <span className="w-24 text-right text-emerald-400 text-xs font-semibold">{fmtInr(total)}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className={lCls}>Notes <span className="normal-case text-zinc-600 font-normal text-[10px]">(optional)</span></label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className={`${iCls} resize-none`} rows={2} placeholder="Any additional notes…" />
      </div>

      {/* Submit */}
      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5 text-sm">
          {loading ? 'Creating…' : documentType === 'INVOICE' && invoiceType === 'SALE' ? 'Create Invoice' : 'Create Proforma Invoice'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-ghost px-4 py-2.5 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
