'use client';

import { useEffect } from 'react';
import { amountToWords } from '@/lib/number-to-words';
import { getFiscalYear } from '@/lib/invoice-number';

type InvoiceItem = {
  id: string;
  description: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  sortOrder: number;
  serialNumbers: string | null;
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
  termsOfPayment: string | null;
  deliveryDays: number | null;
  termsOfDelivery: string | null;
} | null;

type RelatedInvoice = {
  id: string;
  invoiceNumber: string;
  subType: string;
} | null;

type DispatchOrder = {
  doNumber: string;
  approvedBy: { name: string } | null;
  order: {
    product: { code: string; name: string };
  };
} | null;

type Invoice = {
  id: string;
  invoiceNumber: string;
  subType: 'FULL' | 'GOODS' | 'SERVICE';
  splitPercent: number | null;
  currency: string;
  exchangeRate: number | null;
  notes: string | null;
  createdAt: string | Date;
  client: Client;
  items: InvoiceItem[];
  dispatchOrder: DispatchOrder;
  proforma: Proforma;
  relatedInvoice: RelatedInvoice;
};

type Settings = Record<string, string>;

function fmt(amount: number, currency: string) {
  if (currency === 'USD')
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `\u20b9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function calcItem(item: InvoiceItem) {
  return item.quantity * item.unitPrice * (1 - item.discountPercent / 100);
}

function parseSerialNumbers(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function PrintInvoice({ invoice, settings }: { invoice: Invoice; settings: Settings }) {
  const s = (k: string) => settings[k] ?? '';
  const coName = s('company_name') || 'SMX Drives';

  const isExport = invoice.client.globalOrIndian === 'Global';
  const currency = invoice.currency as 'INR' | 'USD';

  const sellerState = (s('company_state') || 'Gujarat').toLowerCase();
  const buyerState = (invoice.client.state ?? '').toLowerCase();
  const isIntraState = !isExport && !!buyerState && buyerState === sellerState;

  const productItems = invoice.items.filter(
    (i) => !(i.hsnCode === '9965' && i.description.toLowerCase().includes('freight'))
  );
  const shippingItem = invoice.items.find(
    (i) => i.hsnCode === '9965' && i.description.toLowerCase().includes('freight')
  );

  const subtotal  = productItems.reduce((acc, item) => acc + calcItem(item), 0);
  const shipping  = shippingItem ? calcItem(shippingItem) : 0;

  // For non-export USD invoices (Indian client billed in USD), GST must be calculated
  // in INR on the INR-equivalent subtotal, then shown separately — never double-converted.
  const exchRate      = invoice.exchangeRate ?? 1;
  const isUsdIndian   = !isExport && currency === 'USD';
  const subtotalINR   = isUsdIndian ? subtotal * exchRate : subtotal;
  const gstAmountINR  = isExport ? 0 : subtotalINR * 0.18;

  // Total in the invoice currency (USD or INR)
  // For USD-Indian invoices: product subtotal in USD + shipping in USD; GST shown in INR separately
  const total     = isUsdIndian
    ? subtotal + shipping                          // USD portion only; GST is INR add-on
    : subtotal + gstAmountINR + shipping;          // INR invoice: everything in INR
  // INR grand total (what the customer actually pays in INR)
  const totalINR  = isUsdIndian
    ? subtotal * exchRate + shipping * exchRate + gstAmountINR
    : currency === 'INR' ? total : total * exchRate;
  const totalQty  = productItems.reduce((acc, i) => acc + i.quantity, 0);

  const fy = getFiscalYear(new Date(invoice.createdAt));

  const subTypeLabel =
    invoice.subType === 'GOODS'   ? 'Tax Invoice (Goods)'
    : invoice.subType === 'SERVICE' ? 'Tax Invoice (Service)'
    : 'Tax Invoice';

  const approvedByName = invoice.dispatchOrder?.approvedBy?.name ?? '—';


  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 7mm 9mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #111; background: #fff; }

        /* OUTER BORDER */
        .page-wrap { border: 1.5px solid #1a3a6b; min-height: 283mm; display: flex; flex-direction: column; }

        /* HEADER */
        .hdr { display: flex; justify-content: space-between; align-items: stretch; border-bottom: 1.5px solid #1a3a6b; }
        .hdr-left { padding: 8px 12px; flex: 1; }
        .hdr-right { padding: 8px 12px; text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; border-left: 1px solid #c8d8f0; min-width: 170px; }
        .co-name { font-size: 14px; font-weight: 700; color: #1a3a6b; letter-spacing: 0.3px; }
        .co-tagline { font-size: 7.5px; color: #555; margin-top: 1px; }
        .co-addr { font-size: 8px; color: #333; margin-top: 3px; line-height: 1.5; }
        .co-gstin { font-size: 7.5px; color: #555; margin-top: 2px; }
        .doc-title { font-size: 13px; font-weight: 800; color: #1a3a6b; letter-spacing: 1px; text-transform: uppercase; }
        .doc-subtitle { font-size: 7.5px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

        /* LUT BAR — bold black text */
        .lut-bar { padding: 3px 10px; background: #f8fff8; border-bottom: 1px solid #b3d9b3; font-size: 8px; color: #000; font-weight: 700; line-height: 1.5; }

        /* INFO BAR — 2 rows */
        .info-bar { border-bottom: 1px solid #c8d8f0; background: #f0f5ff; }
        .info-row { display: grid; grid-template-columns: 1fr 1fr 1fr; }
        .info-row:not(:last-child) { border-bottom: 1px solid #dde8f8; }
        .info-cell { padding: 4px 10px; }
        .info-cell:not(:last-child) { border-right: 1px solid #c8d8f0; }
        .info-label { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #1a3a6b; margin-bottom: 1px; }
        .info-value { font-size: 9px; color: #111; font-weight: 600; }

        /* PARTIES */
        .parties { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #c8d8f0; }
        .party { padding: 6px 10px; }
        .party:first-child { border-right: 1px solid #c8d8f0; }
        .party-label { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #1a3a6b; border-bottom: 1px solid #dde8f8; padding-bottom: 2px; margin-bottom: 3px; }
        .party-name { font-size: 10px; font-weight: 700; color: #111; }
        .party-line { font-size: 8px; color: #333; line-height: 1.5; white-space: pre-line; margin-top: 1px; }

        /* TABLE */
        table { width: 100%; border-collapse: collapse; }
        thead th { background: #1a3a6b; color: #fff; font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 5px 6px; border-right: 1px solid #2a5099; }
        thead th:last-child { border-right: none; }
        thead th.c { text-align: center; }
        thead th.r { text-align: right; }
        tbody tr:nth-child(even) { background: #f7f9fd; }
        tbody td { padding: 4px 6px; font-size: 8.5px; color: #111; vertical-align: top; }
        tbody td.c { text-align: center; }
        tbody td.r { text-align: right; }
        .serial-list { font-family: monospace; font-size: 7px; color: #444; margin-top: 2px; line-height: 1.5; }

        /* TOTALS */
        .totals-wrap { display: flex; justify-content: flex-end; border-top: 1.5px solid #1a3a6b; background: #f0f5ff; padding: 6px 10px; }
        .totals-box { width: 250px; }
        .t-row { display: flex; justify-content: space-between; padding: 1.5px 0; font-size: 8.5px; }
        .t-lbl { color: #444; }
        .t-sep { border-top: 1px solid #b0c0e0; margin: 3px 0; }
        .t-total { font-weight: 800; font-size: 11px; color: #1a3a6b; display: flex; justify-content: space-between; padding: 3px 0; }
        .t-qty { display: flex; justify-content: space-between; padding: 2px 0; font-size: 8.5px; font-weight: 700; color: #1a3a6b; border-top: 1px solid #c8d8f0; margin-top: 3px; padding-top: 3px; }

        /* AMOUNT WORDS */
        .words-bar { padding: 4px 10px; background: #f0f5ff; border-top: 1px solid #c8d8f0; font-size: 8px; line-height: 1.4; display: flex; justify-content: space-between; }

        /* FOOTER — compact, no extra lines at bottom */
        .footer { display: grid; grid-template-columns: 1fr 1fr; border-top: 1.5px solid #1a3a6b; }
        .footer-col { padding: 4px 10px; }
        .footer-col:first-child { border-right: 1px solid #c8d8f0; }
        .f-label { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #1a3a6b; margin-bottom: 2px; }
        .bank-row { font-size: 8px; color: #222; line-height: 1.5; }
        .sign-wrap { display: flex; flex-direction: column; }
        .sign-line { margin-top: 18px; border-top: 1px solid #1a3a6b; padding-top: 2px; font-size: 8px; font-weight: 700; color: #1a3a6b; }
        .declaration { margin-top: 3px; font-size: 7.5px; color: #666; line-height: 1.4; }
        .notes-bar { padding: 3px 10px; font-size: 8px; color: #333; border-top: 1px solid #c8d8f0; }
        .comp-gen { text-align: center; font-size: 7px; color: #999; padding: 2px; background: #f8faff; }
      `}</style>

      {/* Print controls */}
      <div className="no-print" style={{ padding: '10px 16px', background: '#18181b', display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={() => window.print()}
          style={{ background: '#1a3a6b', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
        >
          Print / Save PDF
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: '#3f3f46', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
        >
          Close
        </button>
        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>Use Chrome → Print → Save as PDF for best results</span>
      </div>

      <div className="page-wrap">

        {/* HEADER */}
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
            <div className="doc-title">Tax Invoice</div>
            {invoice.subType !== 'FULL' && (
              <div className="doc-subtitle">{subTypeLabel}</div>
            )}
            {isExport && <div className="doc-subtitle">Zero Rated Export</div>}
            <div className="doc-subtitle">FY {fy}</div>
          </div>
        </div>

        {/* LUT BAR — above Invoice No, bold black */}
        {isExport && (s('lut_number') || s('lut_from')) && (
          <div className="lut-bar">
            Supply under Bond/LUT without payment of IGST — LUT No.: {s('lut_number')}
            &nbsp; Valid: {s('lut_from')} to {s('lut_to')}
          </div>
        )}

        {/* INFO BAR — 2 rows: (Invoice No / Date / Currency) + (Payment Terms / Delivery Terms / Approved By) */}
        <div className="info-bar">
          <div className="info-row">
            <div className="info-cell">
              <div className="info-label">Invoice No.</div>
              <div className="info-value">{invoice.invoiceNumber}</div>
            </div>
            <div className="info-cell">
              <div className="info-label">Date</div>
              <div className="info-value">{fmtDate(invoice.createdAt)}</div>
            </div>
            <div className="info-cell">
              <div className="info-label">Currency</div>
              <div className="info-value">
                {currency}{isExport && invoice.exchangeRate ? ` @ \u20b9${invoice.exchangeRate}` : ''}
              </div>
            </div>
          </div>
          <div className="info-row">
            <div className="info-cell">
              <div className="info-label">Mode / Terms of Payment</div>
              <div className="info-value">{invoice.proforma?.termsOfPayment || '—'}</div>
            </div>
            <div className="info-cell">
              <div className="info-label">Delivery Terms</div>
              <div className="info-value">{invoice.proforma?.termsOfDelivery || '—'}</div>
            </div>
            <div className="info-cell">
              <div className="info-label">Approved By (Accounts)</div>
              <div className="info-value">{approvedByName}</div>
            </div>
          </div>
        </div>

        {/* PARTIES */}
        <div className="parties">
          <div className="party">
            <div className="party-label">Consignee (Ship To)</div>
            <div className="party-name">{invoice.client.customerName}</div>
            {invoice.client.shippingAddress && <div className="party-line">{invoice.client.shippingAddress}</div>}
            {invoice.client.state && <div className="party-line">State: {invoice.client.state}</div>}
            {invoice.client.phone && <div className="party-line">Ph: {invoice.client.phone}</div>}
            {invoice.client.email && <div className="party-line">Email: {invoice.client.email}</div>}
          </div>
          <div className="party">
            <div className="party-label">Buyer (Bill To)</div>
            <div className="party-name">{invoice.client.customerName}</div>
            {invoice.client.billingAddress && <div className="party-line">{invoice.client.billingAddress}</div>}
            {invoice.client.state && <div className="party-line">State: {invoice.client.state}</div>}
            {invoice.client.gstNumber && <div className="party-line">GSTIN: <strong>{invoice.client.gstNumber}</strong></div>}
            {invoice.client.phone && <div className="party-line">Ph: {invoice.client.phone}</div>}
            {invoice.client.email && <div className="party-line">Email: {invoice.client.email}</div>}
          </div>
        </div>

        {/* LINE ITEMS TABLE */}
        <table>
          <thead>
            <tr>
              <th style={{ width: '4%' }} className="c">#</th>
              <th style={{ width: '40%' }}>Description of Goods / Services</th>
              <th style={{ width: '9%' }} className="c">HSN / SAC</th>
              <th style={{ width: '7%' }} className="c">Qty</th>
              <th style={{ width: '6%' }} className="c">UOM</th>
              <th style={{ width: '13%' }} className="r">Rate ({currency})</th>
              <th style={{ width: '7%' }} className="c">Disc %</th>
              <th style={{ width: '14%' }} className="r">Amount ({currency})</th>
            </tr>
          </thead>
          <tbody>
            {productItems.map((item, i) => {
              const serials = parseSerialNumbers(item.serialNumbers);
              const showSep = productItems.length > 1 && i < productItems.length - 1;
              return (
                <tr key={item.id} style={showSep ? { borderBottom: '1.5px solid #b0c4de' } : {}}>
                  <td className="c" style={{ color: '#888', fontSize: 7.5 }}>{i + 1}</td>
                  <td style={{ fontWeight: 500 }}>
                    {item.description}
                    {serials.length > 0 && (
                      <div className="serial-list">
                        SN: {serials.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="c" style={{ fontFamily: 'monospace', fontSize: 7.5 }}>{item.hsnCode}</td>
                  <td className="c">{item.quantity}</td>
                  <td className="c" style={{ color: '#888' }}>PCS</td>
                  <td className="r">{fmt(item.unitPrice, currency)}</td>
                  <td className="c">{item.discountPercent ? `${item.discountPercent}%` : '—'}</td>
                  <td className="r" style={{ fontWeight: 600 }}>{fmt(calcItem(item), currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* TOTALS */}
        <div className="totals-wrap">
          <div className="totals-box">
            <div className="t-row"><span className="t-lbl">Sub Total</span><span>{fmt(subtotal, currency)}</span></div>
            {!isExport && isIntraState && (
              <>
                <div className="t-row"><span className="t-lbl">CGST @ 9%</span><span>{fmt(gstAmountINR * 0.5, 'INR')}</span></div>
                <div className="t-row"><span className="t-lbl">SGST @ 9%</span><span>{fmt(gstAmountINR * 0.5, 'INR')}</span></div>
              </>
            )}
            {!isExport && !isIntraState && (
              <div className="t-row"><span className="t-lbl">IGST @ 18%</span><span>{fmt(gstAmountINR, 'INR')}</span></div>
            )}
            {shipping > 0 && (
              <div className="t-row"><span className="t-lbl">Freight &amp; Forwarding</span><span>{fmt(shipping, currency)}</span></div>
            )}
            <div className="t-sep" />
            <div className="t-total">
              <span>TOTAL</span>
              {isUsdIndian
                ? <span>\u20b9{totalINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                : <span>{fmt(total, currency)}</span>
              }
            </div>
            {currency === 'USD' && invoice.exchangeRate && !isUsdIndian && (
              <div className="t-row" style={{ fontSize: 7.5, color: '#888', marginTop: 2 }}>
                <span>≈ INR @ \u20b9{invoice.exchangeRate}/$</span>
                <span>\u20b9{totalINR.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {isUsdIndian && invoice.exchangeRate && (
              <div className="t-row" style={{ fontSize: 7.5, color: '#888', marginTop: 2 }}>
                <span>USD {fmt(subtotal + shipping, 'USD')} @ \u20b9{invoice.exchangeRate}/$ + GST</span>
                <span>{fmt(subtotal + shipping, 'USD')}</span>
              </div>
            )}
            <div className="t-qty">
              <span>Total Quantity</span>
              <span>{totalQty} PCS</span>
            </div>
          </div>
        </div>

        {/* AMOUNT IN WORDS */}
        <div className="words-bar">
          <span>
            <strong style={{ color: '#1a3a6b' }}>Amount Chargeable (in words):</strong>&nbsp;
            {isUsdIndian ? amountToWords(totalINR, 'INR') : currency === 'USD' ? amountToWords(total, 'USD') : amountToWords(total, 'INR')}
          </span>
          <span style={{ color: '#999', fontStyle: 'italic', fontSize: 7.5 }}>E. &amp; O.E.</span>
        </div>

        {/* NOTES — strip tracking line */}
        {invoice.notes && (() => {
          const cleaned = invoice.notes.split('\n').filter(l => !l.startsWith('Tracking:')).join('\n').trim();
          return cleaned ? (
            <div className="notes-bar">
              <strong style={{ color: '#1a3a6b' }}>Notes: </strong>{cleaned}
            </div>
          ) : null;
        })()}

        {/* FOOTER */}
        <div className="footer">
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
              <div className="f-label">For {coName}</div>
              <div style={{ fontSize: 7.5, color: '#888', marginBottom: 2 }}>Authorised Signatory</div>
              <div className="sign-line">Authorised Signatory</div>
            </div>
          </div>
        </div>

        <div className="comp-gen">This is a Computer Generated Tax Invoice</div>

      </div>
    </>
  );
}
