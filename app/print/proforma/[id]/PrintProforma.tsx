'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
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
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function calcItem(item: Item) {
  return item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
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

  const isFinalInvoice = proforma.invoiceNumber.startsWith('TSM/ES/') || proforma.invoiceNumber.startsWith('TSM/DS/');
  const typeLabel = proforma.invoiceType === 'RETURN'
    ? 'CREDIT NOTE'
    : proforma.invoiceType === 'REPLACEMENT'
      ? 'REPLACEMENT'
      : isFinalInvoice
        ? 'INVOICE'
        : 'PROFORMA INVOICE';

  return (
    <>
      <style>{`
        @page { size: A4; margin: 8mm 10mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color: #111; background: #fff; }

        /* ── OUTER BORDER ── */
        .page-wrap { border: 1.5px solid #1a3a6b; min-height: 277mm; display: flex; flex-direction: column; }

        /* ── HEADER ── */
        .hdr { display: flex; justify-content: space-between; align-items: stretch; border-bottom: 1.5px solid #1a3a6b; }
        .hdr-left { padding: 10px 12px; flex: 1; }
        .hdr-right { padding: 10px 14px; text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; border-left: 1px solid #c8d8f0; min-width: 180px; }
        .co-name { font-size: 15px; font-weight: 700; color: #1a3a6b; letter-spacing: 0.3px; }
        .co-tagline { font-size: 8px; color: #555; margin-top: 1px; }
        .co-addr { font-size: 8.5px; color: #333; margin-top: 4px; line-height: 1.55; }
        .co-gstin { font-size: 8px; color: #555; margin-top: 3px; }
        .doc-title { font-size: 13px; font-weight: 800; color: #1a3a6b; letter-spacing: 1px; text-transform: uppercase; }
        .doc-subtitle { font-size: 7.5px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
        .doc-type-badge { margin-top: 5px; display: inline-block; font-size: 8px; font-weight: 700; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px; }

        /* ── INFO BAR ── */
        .info-bar { display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid #c8d8f0; background: #f0f5ff; }
        .info-cell { padding: 5px 10px; }
        .info-cell:not(:last-child) { border-right: 1px solid #c8d8f0; }
        .info-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #1a3a6b; margin-bottom: 1.5px; }
        .info-value { font-size: 9.5px; color: #111; font-weight: 600; }

        /* ── LUT BAR (export) ── */
        .lut-bar { padding: 4px 10px; background: #f8fff8; border-bottom: 1px solid #b3d9b3; font-size: 8.5px; color: #1a5c1a; line-height: 1.6; }

        /* ── PARTIES ── */
        .parties { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #c8d8f0; }
        .party { padding: 8px 10px; }
        .party:first-child { border-right: 1px solid #c8d8f0; }
        .party-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #1a3a6b; border-bottom: 1px solid #dde8f8; padding-bottom: 3px; margin-bottom: 4px; }
        .party-name { font-size: 10.5px; font-weight: 700; color: #111; }
        .party-line { font-size: 8.5px; color: #333; line-height: 1.6; white-space: pre-line; margin-top: 1px; }

        /* ── TERMS ── */
        .terms-row { display: grid; border-bottom: 1px solid #c8d8f0; background: #fafbfd; }
        .terms-2col { grid-template-columns: 1fr 1fr; }
        .terms-3col { grid-template-columns: 1fr 1fr 1fr; }
        .term-cell { padding: 5px 10px; }
        .term-cell:not(:last-child) { border-right: 1px solid #c8d8f0; }
        .term-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #1a3a6b; margin-bottom: 1.5px; }
        .term-value { font-size: 9px; color: #111; font-weight: 600; }

        /* ── REPLACEMENT INFO ── */
        .repl-bar { display: flex; gap: 24px; background: #fffdf0; border-bottom: 1px solid #e6d472; padding: 5px 10px; }
        .rlabel { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #7a5800; margin-bottom: 1px; }
        .rvalue { font-size: 9px; font-weight: 600; color: #111; }

        /* ── TABLE ── */
        table { width: 100%; border-collapse: collapse; }
        thead th { background: #1a3a6b; color: #fff; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 7px; border-right: 1px solid #2a5099; }
        thead th:last-child { border-right: none; }
        thead th.c { text-align: center; }
        thead th.r { text-align: right; }
        tbody tr { border-bottom: 1px solid #e8edf5; }
        tbody tr:nth-child(even) { background: #f7f9fd; }
        tbody td { padding: 5px 7px; font-size: 9px; color: #111; vertical-align: top; }
        tbody td.c { text-align: center; }
        tbody td.r { text-align: right; }
        .empty-row td { height: 14px; background: #fff !important; }

        /* ── TOTALS ── */
        .totals-wrap { display: flex; justify-content: flex-end; border-top: 1.5px solid #1a3a6b; background: #f0f5ff; padding: 8px 10px; }
        .totals-box { width: 240px; }
        .t-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 9px; }
        .t-lbl { color: #444; }
        .t-sep { border-top: 1px solid #b0c0e0; margin: 4px 0; }
        .t-total { font-weight: 800; font-size: 11.5px; color: #1a3a6b; display: flex; justify-content: space-between; padding: 3px 0; }

        /* ── AMOUNT WORDS ── */
        .words-bar { padding: 5px 10px; background: #f0f5ff; border-top: 1px solid #c8d8f0; font-size: 8.5px; line-height: 1.5; display: flex; justify-content: space-between; }

        /* ── FOOTER ── */
        .footer { display: grid; grid-template-columns: 1fr 1fr; border-top: 1.5px solid #1a3a6b; flex: 1; }
        .footer-col { padding: 8px 10px; }
        .footer-col:first-child { border-right: 1px solid #c8d8f0; }
        .f-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #1a3a6b; margin-bottom: 4px; }
        .bank-row { font-size: 8.5px; color: #222; line-height: 1.7; }
        .sign-wrap { display: flex; flex-direction: column; justify-content: space-between; height: 100%; }
        .sign-line { border-top: 1px solid #1a3a6b; padding-top: 3px; font-size: 8.5px; font-weight: 700; color: #1a3a6b; }
        .declaration { margin-top: 8px; font-size: 8px; color: #666; border-top: 1px solid #e8edf5; padding-top: 5px; line-height: 1.5; }

        /* ── NOTES / FOOTER TEXT ── */
        .notes-bar { padding: 5px 10px; font-size: 8.5px; color: #333; border-top: 1px solid #c8d8f0; }
        .comp-gen { text-align: center; font-size: 7.5px; color: #999; padding: 4px; background: #f8faff; border-top: 1px solid #e8edf5; }
      `}</style>

      {/* Print controls */}
      <div className="no-print" style={{ padding: '10px 16px', background: '#18181b', display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={() => window.print()} style={{ background: '#1a3a6b', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          🖨️ Print / Save PDF
        </button>
        <button onClick={() => window.close()} style={{ background: '#3f3f46', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
          <X className="w-4 h-4 mr-1" /> Close
        </button>
        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>Use Chrome → Print → Save as PDF for best results</span>
      </div>

      <div className="page-wrap">

        {/* ── HEADER ── */}
        <div className="hdr">
          <div className="hdr-left">
            <div className="co-name">{coName}</div>
            {s('company_tagline') && <div className="co-tagline">{s('company_tagline')}</div>}
            <div className="co-addr">
              {s('company_address')?.split('\n').map((line, i) => <span key={i}>{line}<br /></span>)}
            </div>
            <div className="co-gstin">
              {s('company_gstin') && <>GSTIN: <strong>{s('company_gstin')}</strong></>}
              {s('company_state_code') && <>&nbsp; | &nbsp;State Code: <strong>{s('company_state_code')}</strong></>}
              {s('company_phone') && <>&nbsp; | &nbsp;Ph: {s('company_phone')}</>}
            </div>
          </div>
          <div className="hdr-right">
            <div className="doc-title">{typeLabel}</div>
            {isExport && isFinalInvoice && <div className="doc-subtitle">Supply under LUT/Bond — Zero Rated Export</div>}
        {isExport && !isFinalInvoice && <div className="doc-subtitle">Supply under LUT/Bond (Export)</div>}
            <div className="doc-subtitle">FY {fy}</div>
            {proforma.invoiceType !== 'SALE' && (
              <div className="doc-type-badge" style={
                proforma.invoiceType === 'RETURN'
                  ? { background: '#fee2e2', color: '#b91c1c' }
                  : { background: '#fef9c3', color: '#7a5800' }
              }>
                {proforma.invoiceType === 'RETURN' ? 'Return / Credit' : 'Replacement'}
              </div>
            )}
          </div>
        </div>

        {/* ── INFO BAR ── */}
        <div className="info-bar">
          <div className="info-cell">
            <div className="info-label">Invoice No.</div>
            <div className="info-value">{proforma.invoiceNumber}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Date</div>
            <div className="info-value">{fmtDate(proforma.invoiceDate)}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Currency</div>
            <div className="info-value">{currency}{isExport && proforma.exchangeRate ? ` @ ₹${proforma.exchangeRate}` : ''}</div>
          </div>
        </div>

        {/* ── LUT BAR (export only) ── */}
        {isExport && (s('lut_number') || s('lut_from')) && (
          <div className="lut-bar">
            Supply under Bond/LUT without payment of IGST — LUT No.: <strong>{s('lut_number')}</strong>
            &nbsp; Valid: <strong>{s('lut_from')}</strong> to <strong>{s('lut_to')}</strong>
          </div>
        )}

        {/* ── PARTIES ── */}
        <div className="parties">
          <div className="party">
            <div className="party-label">Consignee (Ship To)</div>
            <div className="party-name">{proforma.client.customerName}</div>
            {proforma.client.shippingAddress && <div className="party-line">{proforma.client.shippingAddress}</div>}
            {proforma.client.state   && <div className="party-line">State: {proforma.client.state}</div>}
            {proforma.client.phone   && <div className="party-line">Ph: {proforma.client.phone}</div>}
            {proforma.client.email   && <div className="party-line">Email: {proforma.client.email}</div>}
          </div>
          <div className="party">
            <div className="party-label">Buyer (Bill To)</div>
            <div className="party-name">{proforma.client.customerName}</div>
            {proforma.client.billingAddress && <div className="party-line">{proforma.client.billingAddress}</div>}
            {proforma.client.state     && <div className="party-line">State: {proforma.client.state}</div>}
            {proforma.client.gstNumber && <div className="party-line">GSTIN: <strong>{proforma.client.gstNumber}</strong></div>}
            {proforma.client.phone     && <div className="party-line">Ph: {proforma.client.phone}</div>}
            {proforma.client.email     && <div className="party-line">Email: {proforma.client.email}</div>}
          </div>
        </div>

        {/* ── TERMS ── */}
        <div className={`terms-row ${isExport ? 'terms-2col' : 'terms-3col'}`}>
          <div className="term-cell">
            <div className="term-label">Mode / Terms of Payment</div>
            <div className="term-value">{proforma.termsOfPayment || '—'}</div>
          </div>
          <div className="term-cell">
            <div className="term-label">Delivery Schedule</div>
            <div className="term-value">{proforma.deliveryDays ? `Within ${proforma.deliveryDays} days of payment` : '—'}</div>
          </div>
          {!isExport && (
            <div className="term-cell">
              <div className="term-label">Tax</div>
              <div className="term-value">{isIntraState ? 'CGST 9% + SGST 9%' : 'IGST 18%'}</div>
            </div>
          )}
        </div>

        {/* ── REPLACEMENT INFO ── */}
        {replacementInfo && (
          <div className="repl-bar">
            <div>
              <div className="rlabel">Unit Serial No.</div>
              <div className="rvalue">{replacementInfo.serial || '—'}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div className="rlabel">Customer Complaint / Problem</div>
              <div className="rvalue">{replacementInfo.problem || '—'}</div>
            </div>
          </div>
        )}

        {/* ── LINE ITEMS TABLE ── */}
        <table>
          <thead>
            <tr>
              <th style={{ width: '4%' }} className="c">#</th>
              <th style={{ width: '42%' }}>Description of Goods</th>
              <th style={{ width: '9%' }} className="c">HSN / SAC</th>
              <th style={{ width: '7%' }} className="c">Qty</th>
              <th style={{ width: '6%' }} className="c">UOM</th>
              <th style={{ width: '13%' }} className="r">Rate ({currency})</th>
              <th style={{ width: '7%' }} className="c">Disc %</th>
              <th style={{ width: '12%' }} className="r">Amount ({currency})</th>
            </tr>
          </thead>
          <tbody>
            {productItems.map((item, i) => (
              <tr key={item.id}>
                <td className="c" style={{ color: '#888', fontSize: 8 }}>{i + 1}</td>
                <td style={{ fontWeight: 500 }}>{item.description}</td>
                <td className="c" style={{ fontFamily: 'monospace', fontSize: 8 }}>{item.hsnCode}</td>
                <td className="c">{item.quantity}</td>
                <td className="c" style={{ color: '#888' }}>PCS</td>
                <td className="r">{fmt(item.unitPrice, currency)}</td>
                <td className="c">{item.discountPercent ? `${item.discountPercent}%` : '—'}</td>
                <td className="r" style={{ fontWeight: 600 }}>{fmt(calcItem(item), currency)}</td>
              </tr>
            ))}
            {productItems.length < 6 && Array.from({ length: 6 - productItems.length }).map((_, i) => (
              <tr key={`emp${i}`} className="empty-row"><td /><td /><td /><td /><td /><td /><td /><td /></tr>
            ))}
          </tbody>
        </table>

        {/* ── TOTALS ── */}
        <div className="totals-wrap">
          <div className="totals-box">
            <div className="t-row"><span className="t-lbl">Sub Total</span><span>{fmt(subtotal, currency)}</span></div>
            {!isExport && isIntraState && (
              <>
                <div className="t-row"><span className="t-lbl">CGST @ 9%</span><span>{fmt(subtotal * 0.09, currency)}</span></div>
                <div className="t-row"><span className="t-lbl">SGST @ 9%</span><span>{fmt(subtotal * 0.09, currency)}</span></div>
              </>
            )}
            {!isExport && !isIntraState && (
              <div className="t-row"><span className="t-lbl">IGST @ 18%</span><span>{fmt(gstAmount, currency)}</span></div>
            )}
            {shipping > 0 && <div className="t-row"><span className="t-lbl">Freight &amp; Forwarding</span><span>{fmt(shipping, currency)}</span></div>}
            <div className="t-sep" />
            <div className="t-total"><span>TOTAL</span><span>{fmt(total, currency)}</span></div>
            {currency === 'USD' && proforma.exchangeRate && (
              <div className="t-row" style={{ fontSize: 8, color: '#888', marginTop: 3 }}>
                <span>≈ INR equivalent @ ₹{proforma.exchangeRate}/$</span>
                <span>₹{totalINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div style={{ marginTop: 4, fontSize: 7.5, color: '#888', display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #c8d8f0', paddingTop: 3 }}>
              <span>Total Quantity</span>
              <span>{productItems.reduce((s, i) => s + i.quantity, 0)} PCS</span>
            </div>
          </div>
        </div>

        {/* ── AMOUNT IN WORDS ── */}
        <div className="words-bar">
          <span><strong style={{ color: '#1a3a6b' }}>Amount Chargeable (in words):</strong>&nbsp;
            {currency === 'USD' ? amountToWords(total, 'USD') : amountToWords(total, 'INR')}
          </span>
          <span style={{ color: '#999', fontStyle: 'italic', fontSize: 8 }}>E. &amp; O.E.</span>
        </div>

        {/* ── NOTES ── */}
        {displayNotes && (
          <div className="notes-bar">
            <strong style={{ color: '#1a3a6b' }}>Notes: </strong>{displayNotes}
          </div>
        )}

        {/* ── FOOTER ── */}
        <div className="footer" style={{ marginTop: 'auto' }}>
          <div className="footer-col">
            <div className="f-label">Company Bank Details</div>
            <div className="bank-row">
              {s('bank_holder')  && <div><strong>A/C Holder: </strong>{s('bank_holder')}</div>}
              {s('bank_name')    && <div><strong>Bank: </strong>{s('bank_name')}</div>}
              {s('bank_account') && <div><strong>A/C No.: </strong>{s('bank_account')}</div>}
              {s('bank_ifsc')    && <div><strong>IFSC: </strong>{s('bank_ifsc')}{s('bank_branch') ? ` — ${s('bank_branch')}` : ''}</div>}
              {isExport && s('bank_swift') && <div><strong>SWIFT Code: </strong>{s('bank_swift')}</div>}
            </div>
            <div className="declaration">
              <strong>Declaration: </strong>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
            </div>
          </div>
          <div className="footer-col">
            <div className="sign-wrap">
              <div>
                <div className="f-label">For {coName}</div>
                <div style={{ fontSize: 8, color: '#888', marginBottom: 32 }}>Authorised Signatory</div>
              </div>
              <div className="sign-line">Authorised Signatory</div>
            </div>
          </div>
        </div>

        <div className="comp-gen">This is a Computer Generated {isFinalInvoice ? 'Invoice' : 'Proforma Invoice'}</div>

      </div>
    </>
  );
}
