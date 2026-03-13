'use client';

import { useEffect } from 'react';
import { amountToWords } from '@/lib/number-to-words';
import { getFiscalYear } from '@/lib/invoice-number';

type Item = {
  id: string;
  description: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  product?: { code: string; name: string } | null;
};

type Client = {
  customerName: string;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  gstNumber: string | null;
  globalOrIndian: string | null;
  state: string | null;
};

type Proforma = {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceType: string;
  currency: string;
  exchangeRate: number | null;
  termsOfPayment: string | null;
  deliveryDays: number | null;
  termsOfDelivery: string | null;
  notes: string | null;
  client: Client;
  items: Item[];
};

type Settings = Record<string, string>;

function fmt(amount: number, currency: string) {
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `\u20b9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function calcItem(item: Item) {
  const gross    = item.quantity * item.unitPrice;
  const discount = gross * (item.discountPercent / 100);
  return gross - discount;
}

function parseReplacementNotes(notes: string | null) {
  if (!notes || !notes.startsWith('[REPLACEMENT]')) return null;
  const serialMatch  = notes.match(/Serial:\s*(.+)/);
  const problemMatch = notes.match(/Problem:\s*([\s\S]+?)(\n|$)/);
  return {
    serial:  serialMatch  ? serialMatch[1].trim()  : '',
    problem: problemMatch ? problemMatch[1].trim()  : '',
  };
}

export function PrintProforma({ proforma, settings }: { proforma: Proforma; settings: Settings }) {
  const isExport = proforma.client.globalOrIndian === 'Global';
  const currency = proforma.currency as 'INR' | 'USD';

  const sellerState  = (settings.company_state ?? 'Gujarat').toLowerCase();
  const buyerState   = (proforma.client.state ?? '').toLowerCase();
  const isIntraState = !isExport && !!buyerState && buyerState === sellerState;

  const productItems = proforma.items.filter(
    (i) => !(i.hsnCode === '9965' && i.description.toLowerCase().includes('freight'))
  );
  const shippingItem = proforma.items.find(
    (i) => i.hsnCode === '9965' && i.description.toLowerCase().includes('freight')
  );

  const subtotal  = productItems.reduce((s, item) => s + calcItem(item), 0);
  const shipping  = shippingItem ? calcItem(shippingItem) : 0;
  const gstAmount = isExport ? 0 : subtotal * 0.18;
  const total     = subtotal + gstAmount + shipping;
  const totalINR  = currency === 'INR' ? total : (total * (proforma.exchangeRate ?? 1));

  const fy     = getFiscalYear(new Date(proforma.invoiceDate));
  const s      = (k: string) => settings[k] ?? '';
  const coName = s('company_name') || 'SMX Drives';

  const replacementInfo = proforma.invoiceType === 'REPLACEMENT'
    ? parseReplacementNotes(proforma.notes)
    : null;

  const displayNotes = proforma.notes
    ? proforma.notes.replace(/^\[REPLACEMENT\]\nSerial:.*\nProblem:[^\n]*\n?/, '').trim()
    : '';

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 10mm 12mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 10px; color: #1a1a2e; background: #fff; }

        .header { background: #0f2650; color: #fff; padding: 14px 18px 12px; }
        .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
        .company-name { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; }
        .company-sub { font-size: 9px; color: #93c5fd; margin-top: 3px; }
        .pi-badge { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); padding: 5px 14px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; }
        .header-divider { border-top: 1px solid rgba(255,255,255,0.15); margin: 10px 0 8px; }
        .header-contact { display: flex; gap: 20px; font-size: 9px; color: #bfdbfe; }
        .header-contact span { color: #fff; }

        .info-bar { background: #eef4ff; border-bottom: 2px solid #0f2650; padding: 8px 18px; display: flex; justify-content: space-between; align-items: center; }
        .invoice-no { font-size: 14px; font-weight: 800; color: #0f2650; letter-spacing: 0.5px; }
        .invoice-date { font-size: 9px; color: #475569; margin-top: 1px; }
        .type-badge { font-size: 9px; font-weight: 700; padding: 3px 10px; border-radius: 12px; text-transform: uppercase; letter-spacing: 0.5px; }

        .parties { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #e2e8f0; }
        .party { padding: 10px 18px; }
        .party:first-child { border-right: 1px solid #e2e8f0; }
        .party-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 4px; }
        .party-name { font-size: 11px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
        .party-line { font-size: 9px; color: #475569; line-height: 1.6; white-space: pre-line; }

        .terms-row { display: grid; grid-template-columns: repeat(3,1fr); background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 8px 18px; gap: 12px; }
        .term-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; margin-bottom: 2px; }
        .term-value { font-size: 9px; color: #1e293b; font-weight: 600; }

        .replacement-bar { background: #fffbeb; border-bottom: 1px solid #fcd34d; padding: 7px 18px; display: flex; gap: 28px; }
        .rlabel { font-size: 8px; font-weight: 700; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
        .rvalue { font-size: 9.5px; color: #1e293b; font-weight: 600; }

        .lut-bar { padding: 5px 18px; background: #f0fdf4; border-top: 1px solid #bbf7d0; font-size: 9px; color: #166534; }

        table { width: 100%; border-collapse: collapse; }
        thead th { background: #0f2650; color: #fff; font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 7px 8px; }
        thead th.c { text-align: center; }
        thead th.r { text-align: right; }
        tbody tr { border-bottom: 1px solid #f1f5f9; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        tbody td { padding: 6px 8px; font-size: 9px; color: #1e293b; vertical-align: top; }
        tbody td.c { text-align: center; }
        tbody td.r { text-align: right; }
        .empty-row td { height: 16px; }

        .totals-section { display: flex; justify-content: flex-end; background: #f8fafc; padding: 10px 18px; border-top: 2px solid #0f2650; }
        .totals-inner { width: 260px; }
        .t-row { display: flex; justify-content: space-between; padding: 2.5px 0; font-size: 9.5px; }
        .t-row .lbl { color: #64748b; }
        .t-total { border-top: 2px solid #0f2650; margin-top: 5px; padding-top: 5px; font-weight: 800; font-size: 12px; color: #0f2650; }

        .amount-words { padding: 7px 18px; background: #eef4ff; border-top: 1px solid #bfdbfe; border-bottom: 1px solid #bfdbfe; font-size: 9px; line-height: 1.5; }

        .footer-grid { display: grid; grid-template-columns: 1fr 1fr; border-top: 2px solid #0f2650; min-height: 80px; }
        .footer-col { padding: 10px 18px; }
        .footer-col:first-child { border-right: 1px solid #e2e8f0; }
        .footer-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; margin-bottom: 6px; }
        .bank-line { font-size: 9px; color: #1e293b; line-height: 1.7; }
        .sign-area { display: flex; flex-direction: column; height: 100%; justify-content: space-between; }
        .sign-bottom { border-top: 1px solid #0f2650; padding-top: 3px; font-size: 9px; font-weight: 700; color: #0f2650; }

        .notes-bar { padding: 6px 18px; font-size: 9px; color: #475569; border-top: 1px solid #e2e8f0; }
        .computer-gen { text-align: center; font-size: 8px; color: #94a3b8; padding: 5px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
      `}</style>

      {/* Print controls */}
      <div className="no-print" style={{ padding: '12px 20px', background: '#18181b', display: 'flex', gap: 12 }}>
        <button onClick={() => window.print()} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          🖨️ Print / Save PDF
        </button>
        <button onClick={() => window.close()} style={{ background: '#3f3f46', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontSize: 13 }}>
          ✕ Close
        </button>
      </div>

      <div>

        {/* HEADER */}
        <div className="header">
          <div className="header-top">
            <div>
              <div className="company-name">
                {coName}
                <span style={{ fontSize: 10, fontWeight: 400, marginLeft: 8, color: '#93c5fd' }}>(20{fy.slice(0,2)}-{fy.slice(3)})</span>
              </div>
              <div className="company-sub">
                {s('company_address')?.split('\n')[0]}
                {s('company_gstin') && <> &nbsp;|&nbsp; GSTIN: {s('company_gstin')}</>}
              </div>
            </div>
            <div className="pi-badge">PROFORMA INVOICE</div>
          </div>
          <div className="header-divider" />
          <div className="header-contact">
            {s('company_phone') && <div><span>Ph:</span> {s('company_phone')}</div>}
            {s('company_email') && <div><span>Email:</span> {s('company_email')}</div>}
            {s('company_state') && <div><span>State:</span> {s('company_state')} {s('company_state_code') && `(Code: ${s('company_state_code')})`}</div>}
          </div>
        </div>

        {/* INFO BAR */}
        <div className="info-bar">
          <div>
            <div className="invoice-no">{proforma.invoiceNumber}</div>
            <div className="invoice-date">Date: {fmtDate(proforma.invoiceDate)}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {proforma.invoiceType === 'SALE' && (
              <span className="type-badge" style={{ background: '#dbeafe', color: '#1d4ed8' }}>Sale</span>
            )}
            {proforma.invoiceType === 'RETURN' && (
              <span className="type-badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>Return / Credit Note</span>
            )}
            {proforma.invoiceType === 'REPLACEMENT' && (
              <span className="type-badge" style={{ background: '#fef9c3', color: '#92400e' }}>Replacement</span>
            )}
            {isExport && (
              <span className="type-badge" style={{ background: '#ecfdf5', color: '#065f46' }}>Export (Zero GST)</span>
            )}
          </div>
        </div>

        {/* LUT Bar (export only) */}
        {isExport && (s('lut_number') || s('lut_from')) && (
          <div className="lut-bar">
            Supply under Bond/LUT without payment of IGST &nbsp;—&nbsp;
            LUT No.: <strong>{s('lut_number')}</strong>&nbsp;
            From: <strong>{s('lut_from')}</strong>&nbsp;
            To: <strong>{s('lut_to')}</strong>
          </div>
        )}

        {/* PARTIES */}
        <div className="parties">
          <div className="party">
            <div className="party-label">Ship To (Consignee)</div>
            <div className="party-name">{proforma.client.customerName}</div>
            {proforma.client.shippingAddress && (
              <div className="party-line">{proforma.client.shippingAddress}</div>
            )}
            {proforma.client.phone   && <div className="party-line">Ph: {proforma.client.phone}</div>}
            {proforma.client.email   && <div className="party-line">Email: {proforma.client.email}</div>}
            {proforma.client.state   && <div className="party-line">State: {proforma.client.state}</div>}
          </div>
          <div className="party">
            <div className="party-label">Bill To (Buyer)</div>
            <div className="party-name">{proforma.client.customerName}</div>
            {proforma.client.billingAddress && (
              <div className="party-line">{proforma.client.billingAddress}</div>
            )}
            {proforma.client.phone     && <div className="party-line">Ph: {proforma.client.phone}</div>}
            {proforma.client.email     && <div className="party-line">Email: {proforma.client.email}</div>}
            {proforma.client.gstNumber && <div className="party-line">GSTIN: <strong>{proforma.client.gstNumber}</strong></div>}
            {proforma.client.state     && <div className="party-line">State: {proforma.client.state}</div>}
          </div>
        </div>

        {/* TERMS */}
        <div className="terms-row">
          <div>
            <div className="term-label">Terms of Payment</div>
            <div className="term-value">{proforma.termsOfPayment || '—'}</div>
          </div>
          <div>
            <div className="term-label">Delivery Schedule</div>
            <div className="term-value">
              {proforma.deliveryDays ? `Within ${proforma.deliveryDays} days of payment` : '—'}
            </div>
          </div>
          <div>
            <div className="term-label">Tax Applicable</div>
            <div className="term-value">
              {isExport ? 'Export — 0% GST' : isIntraState ? 'CGST 9% + SGST 9%' : 'IGST 18%'}
            </div>
          </div>
        </div>

        {/* REPLACEMENT INFO */}
        {replacementInfo && (
          <div className="replacement-bar">
            <div>
              <div className="rlabel">Unit Serial No.</div>
              <div className="rvalue">{replacementInfo.serial || '—'}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="rlabel">Customer Complaint / Problem Description</div>
              <div className="rvalue">{replacementInfo.problem || '—'}</div>
            </div>
          </div>
        )}

        {/* LINE ITEMS TABLE */}
        <table>
          <thead>
            <tr>
              <th style={{ width: '4%' }} className="c">#</th>
              <th style={{ width: '40%' }}>Description of Goods / Services</th>
              <th style={{ width: '10%' }} className="c">HSN/SAC</th>
              <th style={{ width: '7%' }} className="c">Qty</th>
              <th style={{ width: '7%' }} className="c">UOM</th>
              <th style={{ width: '13%' }} className="r">Rate ({currency === 'USD' ? 'USD' : 'INR'})</th>
              <th style={{ width: '7%' }} className="c">Disc %</th>
              <th style={{ width: '12%' }} className="r">Amount ({currency === 'USD' ? 'USD' : 'INR'})</th>
            </tr>
          </thead>
          <tbody>
            {productItems.map((item, i) => (
              <tr key={item.id}>
                <td className="c" style={{ color: '#94a3b8', fontSize: 8 }}>{i + 1}</td>
                <td style={{ fontWeight: 500 }}>{item.description}</td>
                <td className="c" style={{ fontFamily: 'monospace', fontSize: 8.5 }}>{item.hsnCode}</td>
                <td className="c">{item.quantity}</td>
                <td className="c" style={{ color: '#94a3b8' }}>PCS</td>
                <td className="r">{fmt(item.unitPrice, currency)}</td>
                <td className="c">{item.discountPercent ? `${item.discountPercent}%` : '—'}</td>
                <td className="r" style={{ fontWeight: 600 }}>{fmt(calcItem(item), currency)}</td>
              </tr>
            ))}
            {productItems.length < 5 && Array.from({ length: 5 - productItems.length }).map((_, i) => (
              <tr key={`emp${i}`} className="empty-row">
                <td /><td /><td /><td /><td /><td /><td /><td />
              </tr>
            ))}
          </tbody>
        </table>

        {/* TOTALS */}
        <div className="totals-section">
          <div className="totals-inner">
            <div className="t-row"><span className="lbl">Subtotal</span><span>{fmt(subtotal, currency)}</span></div>
            {!isExport && isIntraState && (
              <>
                <div className="t-row"><span className="lbl">CGST @ 9%</span><span>{fmt(subtotal * 0.09, currency)}</span></div>
                <div className="t-row"><span className="lbl">SGST @ 9%</span><span>{fmt(subtotal * 0.09, currency)}</span></div>
              </>
            )}
            {!isExport && !isIntraState && (
              <div className="t-row"><span className="lbl">IGST @ 18%</span><span>{fmt(gstAmount, currency)}</span></div>
            )}
            {shipping > 0 && (
              <div className="t-row"><span className="lbl">Freight &amp; Forwarding</span><span>{fmt(shipping, currency)}</span></div>
            )}
            <div className="t-row t-total">
              <span>TOTAL</span>
              <span>{fmt(total, currency)}</span>
            </div>
            {currency === 'USD' && proforma.exchangeRate && (
              <div className="t-row" style={{ fontSize: 8, color: '#94a3b8', marginTop: 4 }}>
                <span>≈ INR @ ₹{proforma.exchangeRate}/$</span>
                <span>₹{totalINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 4, fontSize: 8, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
              <span>Total Quantity</span>
              <span>{productItems.reduce((s, i) => s + i.quantity, 0)} PCS</span>
            </div>
          </div>
        </div>

        {/* AMOUNT IN WORDS */}
        <div className="amount-words">
          <strong style={{ color: '#0f2650' }}>Amount Chargeable (in words): </strong>
          {currency === 'USD' ? amountToWords(total, 'USD') : amountToWords(total, 'INR')}
          <span style={{ float: 'right', color: '#94a3b8', fontStyle: 'italic' }}>E. &amp; O.E.</span>
        </div>

        {/* FOOTER */}
        <div className="footer-grid">
          <div className="footer-col">
            <div className="footer-label">Company Bank Details</div>
            <div className="bank-line">
              {s('bank_holder')  && <div><strong>A/C Holder: </strong>{s('bank_holder')}</div>}
              {s('bank_name')    && <div><strong>Bank: </strong>{s('bank_name')}</div>}
              {s('bank_account') && <div><strong>Account No.: </strong>{s('bank_account')}</div>}
              {s('bank_branch')  && <div><strong>Branch &amp; IFSC: </strong>{s('bank_branch')} &amp; {s('bank_ifsc')}</div>}
              {isExport && s('bank_swift') && <div><strong>SWIFT: </strong>{s('bank_swift')}</div>}
            </div>
            <div style={{ marginTop: 8, borderTop: '1px solid #e2e8f0', paddingTop: 5, fontSize: 8, color: '#64748b', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, color: '#94a3b8', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 3 }}>Declaration</div>
              We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
            </div>
          </div>
          <div className="footer-col">
            <div className="sign-area">
              <div>
                <div className="footer-label">Authorised Signatory</div>
                <div style={{ fontSize: 9, color: '#475569', marginBottom: 36 }}>for {coName}</div>
              </div>
              <div className="sign-bottom">Authorised Signatory</div>
            </div>
          </div>
        </div>

        {/* NOTES */}
        {displayNotes && (
          <div className="notes-bar">
            <strong style={{ color: '#0f2650' }}>Notes: </strong>{displayNotes}
          </div>
        )}

        {/* COMPUTER GENERATED */}
        <div className="computer-gen">This is a Computer Generated Proforma Invoice</div>

      </div>
    </>
  );
}
