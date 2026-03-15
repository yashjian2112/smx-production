'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Client  = { id: string; code: string; customerName: string; globalOrIndian: string | null; gstNumber: string | null; state: string | null };
type Product = { id: string; code: string; name: string };

type InitialItem = {
  id: string;
  description: string;
  productId: string | null;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  voltageFrom?: string | null;
  voltageTo?: string | null;
  product?: { id: string; code: string; name: string } | null;
};

type InitialProforma = {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  clientId: string;
  currency: string;
  exchangeRate: number | null;
  termsOfPayment: string | null;
  deliveryDays: number | null;
  termsOfDelivery: string | null;
  notes: string | null;
  items: InitialItem[];
};

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

const HSN_KNOWN = ['85371000', '85015290', '85285200', '9965'];
const HSN_OPTIONS = [
  { value: '85371000', label: '85371000 — Controller' },
  { value: '85015290', label: '85015290 — Motor' },
  { value: '85285200', label: '85285200 — Display' },
  { value: '9965',     label: '9965 — Shipping / Freight' },
  { value: 'custom',   label: 'Other (type below)' },
];

const PAYMENT_PRESETS  = ['100% ADVANCE', '50% Advance, 50% on delivery', '30 days net', 'LC at sight'];

let keyCounter = 100;

function newItem(): LineItem {
  return { key: ++keyCounter, description: '', productId: '', hsnCode: '85371000', quantity: 1, unitPrice: 0, discountPercent: 0, voltageFrom: '', voltageTo: '' };
}

function calcAmount(item: LineItem) {
  return item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
}

function isShippingItem(item: InitialItem) {
  return item.hsnCode === '9965' && item.description.toLowerCase().includes('freight');
}

function toLineItem(i: InitialItem): LineItem {
  return {
    key:             ++keyCounter,
    description:     i.description,
    productId:       i.productId ?? '',
    hsnCode:         i.hsnCode,
    quantity:        i.quantity,
    unitPrice:       i.unitPrice,
    discountPercent: i.discountPercent,
    voltageFrom:     i.voltageFrom ?? '',
    voltageTo:       i.voltageTo ?? '',
  };
}

function parseReplacementNotes(notes: string | null, field: 'serial' | 'problem'): string {
  if (!notes) return '';
  if (field === 'serial') {
    const m = notes.match(/Serial:\s*(.+)/);
    return m ? m[1].trim() : '';
  }
  const m = notes.match(/Problem:\s*([\s\S]+?)(\n\[|$)/);
  return m ? m[1].trim() : '';
}

function stripReplacementHeader(notes: string | null): string {
  if (!notes) return '';
  // Remove [REPLACEMENT]\nSerial: ...\nProblem: ... from the front
  return notes.replace(/^\[REPLACEMENT\]\nSerial:.*\nProblem:.*\n?/, '').trim();
}

const lCls = 'block text-[11px] font-medium text-zinc-500 tracking-widest uppercase mb-1.5';
const iCls = 'input-field text-sm w-full';
const sCls = 'select-field text-sm w-full';

export function EditProformaForm({
  proforma,
  clients,
  products,
}: {
  proforma:  InitialProforma;
  clients:   Client[];
  products:  Product[];
}) {
  const router = useRouter();

  // Separate out shipping item from regular items
  const [items, setItems] = useState<LineItem[]>(() =>
    proforma.items.filter((i) => !isShippingItem(i)).map(toLineItem)
  );

  // Extract shipping charges from item with HSN 9965
  const [shippingCharges, setShippingCharges] = useState(() => {
    const s = proforma.items.find(isShippingItem);
    return s ? s.unitPrice.toString() : '';
  });

  // Build initial custom HSN map
  const [hsnInputs, setHsnInputs] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {};
    let kc = 100;
    proforma.items.filter((i) => !isShippingItem(i)).forEach((orig) => {
      const key = ++kc;
      if (!HSN_KNOWN.includes(orig.hsnCode)) {
        map[key] = orig.hsnCode;
      }
    });
    return map;
  });

  const isReplacement = proforma.invoiceType === 'REPLACEMENT';

  const [clientId,       setClientId]       = useState(proforma.clientId);
  const [currency,       setCurrency]       = useState<'INR' | 'USD'>(proforma.currency as 'INR' | 'USD');
  const [termsOfPayment, setTermsOfPayment] = useState(proforma.termsOfPayment ?? '');
  const [deliveryDays,   setDeliveryDays]   = useState(proforma.deliveryDays?.toString() ?? '');
  const [notes,          setNotes]          = useState(() => isReplacement ? stripReplacementHeader(proforma.notes) : (proforma.notes ?? ''));

  // Replacement-specific
  const [unitSerial,  setUnitSerial]  = useState(() => isReplacement ? parseReplacementNotes(proforma.notes, 'serial') : '');
  const [problemDesc, setProblemDesc] = useState(() => isReplacement ? parseReplacementNotes(proforma.notes, 'problem') : '');

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  // Derived
  const selectedClient = clients.find((c) => c.id === clientId);

  function handleClientChange(id: string) {
    setClientId(id);
    const c = clients.find((x) => x.id === id);
    if (c) setCurrency(c.globalOrIndian === 'Global' ? 'USD' : 'INR');
  }

  // Line item helpers
  function addItem()                              { setItems((prev) => [...prev, newItem()]); }
  function removeItem(key: number)                { setItems((prev) => prev.filter((i) => i.key !== key)); }
  function updateItem(key: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((i) => i.key === key ? { ...i, ...patch } : i));
  }

  function handleProductSelect(key: number, productId: string) {
    const p = products.find((x) => x.id === productId);
    if (p) {
      updateItem(key, { productId, description: p.name, hsnCode: '85371000' });
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

  // Totals
  const subtotal    = items.reduce((s, i) => s + calcAmount(i), 0);
  const shipping    = parseFloat(shippingCharges) || 0;
  const isExport    = currency === 'USD';
  const sellerState = 'gujarat';
  const buyerState  = (selectedClient?.state ?? '').toLowerCase();
  const isIntra     = !isExport && !!buyerState && buyerState === sellerState;
  const gst         = isExport ? 0 : subtotal * 0.18;
  const total       = subtotal + gst + shipping;

  const fmtAmt = (n: number) =>
    currency === 'USD'
      ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

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
    if (isReplacement && (!unitSerial.trim() || !problemDesc.trim())) {
      setError('Please fill in Unit Serial Number and Problem Description for replacement');
      return;
    }
    setError('');
    setLoading(true);

    // Build notes
    let finalNotes = notes.trim();
    if (isReplacement) {
      finalNotes = `[REPLACEMENT]\nSerial: ${unitSerial.trim()}\nProblem: ${problemDesc.trim()}${finalNotes ? '\n' + finalNotes : ''}`;
    }

    // Build submit items
    const submitItems = items.map((item, idx) => ({
      description:     item.description,
      productId:       item.productId || undefined,
      hsnCode:         item.hsnCode,
      quantity:        item.quantity,
      unitPrice:       item.unitPrice,
      discountPercent: item.discountPercent,
      voltageFrom:     item.voltageFrom || null,
      voltageTo:       item.voltageTo || null,
      sortOrder:       idx,
    }));
    if (shipping > 0) {
      submitItems.push({
        description:     'Freight & Forwarding Charges',
        productId:       undefined,
        hsnCode:         '9965',
        quantity:        1,
        unitPrice:       shipping,
        discountPercent: 0,
        voltageFrom:     null,
        voltageTo:       null,
        sortOrder:       submitItems.length,
      });
    }

    try {
      const res = await fetch(`/api/proformas/${proforma.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          currency,
          termsOfPayment:  termsOfPayment  || undefined,
          deliveryDays:    deliveryDays ? parseInt(deliveryDays, 10) : null,
          notes:           finalNotes    || undefined,
          items:           submitItems,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || 'Failed to update invoice'); setLoading(false); return; }
      router.push(`/sales/${proforma.id}`);
    } catch { setError('Network error'); setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-12">

      {error && (
        <div className="p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* Invoice Type — read-only */}
      <div>
        <label className={lCls}>Invoice Type</label>
        <div className="input-field text-sm text-zinc-400 select-none" style={{ background: 'rgba(255,255,255,0.02)' }}>
          {proforma.invoiceType[0] + proforma.invoiceType.slice(1).toLowerCase()}
        </div>
        <p className="text-[10px] text-zinc-600 mt-1">Invoice type cannot be changed after creation.</p>
      </div>

      {/* Replacement fields */}
      {isReplacement && (
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
      <div>
        <label className={lCls}>Currency</label>
        <div className="flex gap-2 max-w-[160px]">
          {(['INR', 'USD'] as const).map((c) => (
            <button key={c} type="button" onClick={() => setCurrency(c)}
              className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
              style={currency === c
                ? { background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.4)', color: '#38bdf8' }
                : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#71717a' }}>
              {c}
            </button>
          ))}
        </div>
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
        <input type="number" min={1} value={deliveryDays} onChange={(e) => setDeliveryDays(e.target.value)} className={iCls} placeholder="e.g. 30" />
      </div>

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

              {/* HSN + Qty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lCls}>HSN Code <span className="text-red-400">*</span></label>
                  <select
                    value={item.key in hsnInputs ? 'custom' : (HSN_KNOWN.includes(item.hsnCode) ? item.hsnCode : 'custom')}
                    onChange={(e) => handleHsnSelect(item.key, e.target.value)}
                    className={sCls}
                  >
                    {HSN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {(item.key in hsnInputs || (!HSN_KNOWN.includes(item.hsnCode) && item.hsnCode)) && (
                    <input
                      className={`${iCls} mt-1.5`}
                      placeholder="Enter HSN code…"
                      value={item.key in hsnInputs ? hsnInputs[item.key] : item.hsnCode}
                      onChange={(e) => {
                        setHsnInputs((prev) => ({ ...prev, [item.key]: e.target.value }));
                        updateItem(item.key, { hsnCode: e.target.value });
                      }}
                    />
                  )}
                </div>
                <div>
                  <label className={lCls}>Qty (PCS) <span className="text-red-400">*</span></label>
                  <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: parseInt(e.target.value, 10) || 1 })} className={iCls} />
                </div>
              </div>

              {/* Voltage Range */}
              <div>
                <label className={lCls}>Voltage Range <span className="text-red-400">*</span></label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={item.voltageFrom} onChange={(e) => updateItem(item.key, { voltageFrom: e.target.value })} className={iCls} placeholder="From (e.g. 48)" required />
                  <span className="text-zinc-500 text-sm shrink-0">to</span>
                  <input type="number" min={0} value={item.voltageTo} onChange={(e) => updateItem(item.key, { voltageTo: e.target.value })} className={iCls} placeholder="To (e.g. 120)" required />
                  <span className="text-zinc-500 text-xs shrink-0">V</span>
                </div>
              </div>

              {/* Price + Discount + Amount */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lCls}>Unit Price ({currency === 'USD' ? '$' : '₹'}) <span className="text-red-400">*</span></label>
                  <input type="number" min={0} step="0.01" value={item.unitPrice || ''} onChange={(e) => updateItem(item.key, { unitPrice: parseFloat(e.target.value) || 0 })} className={iCls} placeholder="0.00" required />
                </div>
                <div>
                  <label className={lCls}>Discount %</label>
                  <input type="number" min={0} max={100} step="0.01" value={item.discountPercent || ''} onChange={(e) => updateItem(item.key, { discountPercent: parseFloat(e.target.value) || 0 })} className={iCls} placeholder="0" />
                </div>
                <div>
                  <label className={lCls}>Amount</label>
                  <div className="input-field text-sm text-zinc-400 select-none" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {currency === 'USD' ? '$' : '₹'}{calcAmount(item).toLocaleString(currency === 'USD' ? 'en-US' : 'en-IN', { minimumFractionDigits: 2 })}
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
          className={iCls}
          placeholder="0.00"
        />
      </div>

      {/* ── Totals Summary ── */}
      {items.length > 0 && (
        <div className="rounded-xl border border-zinc-800 p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Sub Total</span>
            <span>{fmtAmt(subtotal)}</span>
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
            <div className="flex justify-between text-sm text-zinc-500"><span>Shipping</span><span>{fmtAmt(shipping)}</span></div>
          )}
          <div className="flex justify-between text-sm font-semibold border-t border-zinc-800 pt-2">
            <span>Total</span>
            <span className="text-sky-400">{fmtAmt(total)}</span>
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
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
        <button type="button" onClick={() => router.push(`/sales/${proforma.id}`)} className="btn-ghost px-4 py-2.5 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
