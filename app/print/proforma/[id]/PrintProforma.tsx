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
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

function calcItem(item: Item) {
  const gross    = item.quantity * item.unitPrice;
  const discount = gross * (item.discountPercent / 100);
  return gross - discount;
}

export function PrintProforma({ proforma, settings }: { proforma: Proforma; settings: Settings }) {
  const isExport = proforma.client.globalOrIndian === 'Global';
  const isINR    = proforma.currency === 'INR';
  const currency = proforma.currency as 'INR' | 'USD';

  // GST logic for domestic
  const sellerState   = (settings.company_state ?? 'Gujarat').toLowerCase();
  const buyerState    = (proforma.client.state ?? '').toLowerCase();
  const isIntraState  = buyerState && buyerState === sellerState;

  // Subtotal
  const subtotal = proforma.items.reduce((s, item) => s + calcItem(item), 0);
  const gstRate  = 0.18;
  const gstAmount= isExport ? 0 : subtotal * gstRate;
  const total    = subtotal + gstAmount;
  const totalINR = isINR ? total : (total * (proforma.exchangeRate ?? 1));

  // Fiscal year for company name suffix
  const fy = getFiscalYear(new Date(proforma.invoiceDate));

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  const s  = (k: string) => settings[k] ?? '';
  const coName = `${s('company_name')} (20${fy.slice(0, 2)}-${fy.slice(3)})`;

  return (
    <>
      <style>{`
        @page { size: A4; margin: 12mm 14mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; margin: 0; padding: 0; }
        table { width: 100%; border-collapse: collapse; }
        td, th { border: 1px solid #000; padding: 3px 5px; vertical-align: top; }
        .no-border td, .no-border th { border: none; }
        .bold { font-weight: bold; }
        .center { text-align: center; }
        .right { text-align: right; }
        .small { font-size: 9px; }
        .title { font-size: 14px; font-weight: bold; text-align: center; }
        .subtitle { font-size: 9px; text-align: center; font-style: italic; }
        .section-header { background: #f0f0f0; font-weight: bold; font-size: 10px; }
        hr { border: 0; border-top: 1px solid #000; margin: 3px 0; }
      `}</style>

      {/* Print button — hidden on actual print */}
      <div className="no-print" style={{ padding: '12px 20px', background: '#18181b', display: 'flex', gap: 12 }}>
        <button onClick={() => window.print()} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer', fontWeight: 600 }}>
          🖨️ Print / Save PDF
        </button>
        <button onClick={() => window.close()} style={{ background: '#3f3f46', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', cursor: 'pointer' }}>
          Close
        </button>
      </div>

      <div style={{ padding: '4px 0' }}>

        {/* ── Title ── */}
        <p className="title">PROFORMA INVOICE</p>
        {isExport && (
          <p className="subtitle">
            (SUPPLY MEANT FOR EXPORT / SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED
            OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF IGST)
          </p>
        )}
        {!isExport && proforma.invoiceType === 'RETURN' && (
          <p className="subtitle">(RETURN / CREDIT NOTE)</p>
        )}
        {!isExport && proforma.invoiceType === 'REPLACEMENT' && (
          <p className="subtitle">(REPLACEMENT INVOICE)</p>
        )}

        <div style={{ height: 4 }} />

        {/* ── Header table: Invoice No / Date / Payment / LUT ── */}
        <table style={{ marginBottom: 4 }}>
          <tbody>
            <tr>
              <td style={{ width: '50%' }}>
                <span className="bold">Invoice No.</span><br />
                <span style={{ fontSize: 13, fontWeight: 'bold' }}>{proforma.invoiceNumber}</span>
              </td>
              <td style={{ width: '50%' }}>
                <span className="bold">Dated</span><br />
                {fmtDate(proforma.invoiceDate)}
              </td>
            </tr>
            <tr>
              <td>
                <span className="bold">Mode / Terms of Payment</span><br />
                {proforma.termsOfPayment ?? '—'}
              </td>
              <td>
                <span className="bold">Terms of Delivery</span><br />
                {proforma.termsOfDelivery ?? '—'}
              </td>
            </tr>
            {isExport && (
              <tr>
                <td colSpan={2}>
                  <span className="bold">LUT/Bond No.: </span>{s('lut_number')}
                  &nbsp;&nbsp;
                  <span className="bold">From: </span>{s('lut_from')}
                  &nbsp;&nbsp;
                  <span className="bold">To: </span>{s('lut_to')}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* ── Seller / Buyer block ── */}
        <table style={{ marginBottom: 4 }}>
          <tbody>
            <tr>
              <td style={{ width: '50%' }}>
                <div className="bold" style={{ fontSize: 10, marginBottom: 2 }}>{coName}</div>
                <div style={{ whiteSpace: 'pre-line' }}>{s('company_address')}</div>
                <div><span className="bold">GSTIN/UIN:</span> {s('company_gstin')}</div>
                <div><span className="bold">State Name:</span> {s('company_state')}, Code: {s('company_state_code')}</div>
                <div><span className="bold">Contact:</span> {s('company_phone')}</div>
                <div><span className="bold">E-Mail:</span> {s('company_email')}</div>
              </td>
              <td style={{ width: '50%' }}>
                <div>
                  <div className="section-header" style={{ marginBottom: 4 }}>Consignee (Ship to)</div>
                  <div className="bold">{proforma.client.customerName}</div>
                  {proforma.client.shippingAddress && (
                    <div style={{ whiteSpace: 'pre-line' }}>{proforma.client.shippingAddress}</div>
                  )}
                  {proforma.client.phone && <div>{proforma.client.phone}</div>}
                  {proforma.client.email && <div>{proforma.client.email}</div>}
                  {proforma.client.state && <div><span className="bold">State Name:</span> {proforma.client.state}</div>}
                </div>
                <hr />
                <div>
                  <div className="section-header" style={{ marginBottom: 4 }}>Buyer (Bill to)</div>
                  <div className="bold">{proforma.client.customerName}</div>
                  {proforma.client.billingAddress && (
                    <div style={{ whiteSpace: 'pre-line' }}>{proforma.client.billingAddress}</div>
                  )}
                  {proforma.client.phone && <div>{proforma.client.phone}</div>}
                  {proforma.client.email && <div>{proforma.client.email}</div>}
                  {proforma.client.gstNumber && <div><span className="bold">GSTIN:</span> {proforma.client.gstNumber}</div>}
                  {proforma.client.state && <div><span className="bold">State Name:</span> {proforma.client.state}</div>}
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── Delivery ── */}
        {proforma.deliveryDays && (
          <table style={{ marginBottom: 4 }}>
            <tbody>
              <tr>
                <td>
                  <span className="bold">Delivery: </span>
                  Within {proforma.deliveryDays} days from the date of receipt of payment
                </td>
              </tr>
            </tbody>
          </table>
        )}

        {/* ── Line Items ── */}
        <table style={{ marginBottom: 0 }}>
          <thead>
            <tr className="section-header">
              <th style={{ width: '5%' }}  className="center">Sl.</th>
              <th style={{ width: '38%' }}>Description of Goods</th>
              <th style={{ width: '12%' }} className="center">HSN/SAC</th>
              <th style={{ width: '10%' }} className="center">Quantity</th>
              <th style={{ width: '12%' }} className="right">Rate</th>
              <th style={{ width: '5%'  }} className="center">per</th>
              <th style={{ width: '8%'  }} className="center">Disc.%</th>
              <th style={{ width: '10%' }} className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {proforma.items.map((item, i) => (
              <tr key={item.id}>
                <td className="center">{i + 1}</td>
                <td>{item.description}</td>
                <td className="center">{item.hsnCode}</td>
                <td className="center">{item.quantity} PCS</td>
                <td className="right">{fmt(item.unitPrice, currency)}</td>
                <td className="center">PCS</td>
                <td className="center">{item.discountPercent ? `${item.discountPercent}%` : ''}</td>
                <td className="right">{fmt(calcItem(item), currency)}</td>
              </tr>
            ))}
            {/* Spacer rows */}
            {proforma.items.length < 5 && Array.from({ length: 5 - proforma.items.length }).map((_, i) => (
              <tr key={`empty-${i}`}>
                <td>&nbsp;</td><td /><td /><td /><td /><td /><td /><td />
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Totals ── */}
        <table style={{ marginBottom: 0, borderTop: 'none' }}>
          <tbody>
            {/* Subtotal if GST applies */}
            {!isExport && (
              <tr>
                <td colSpan={5} className="right bold">Sub Total</td>
                <td colSpan={3} className="right bold">{fmt(subtotal, currency)}</td>
              </tr>
            )}

            {/* GST rows for Indian domestic */}
            {!isExport && isIntraState && (
              <>
                <tr>
                  <td colSpan={5} className="right">CGST @ 9%</td>
                  <td colSpan={3} className="right">{fmt(subtotal * 0.09, currency)}</td>
                </tr>
                <tr>
                  <td colSpan={5} className="right">SGST @ 9%</td>
                  <td colSpan={3} className="right">{fmt(subtotal * 0.09, currency)}</td>
                </tr>
              </>
            )}
            {!isExport && !isIntraState && (
              <tr>
                <td colSpan={5} className="right">IGST @ 18%</td>
                <td colSpan={3} className="right">{fmt(gstAmount, currency)}</td>
              </tr>
            )}

            {/* Total row */}
            <tr className="bold">
              <td colSpan={3} className="right">Total</td>
              <td className="center">
                {proforma.items.reduce((s, i) => s + i.quantity, 0)} PCS
              </td>
              <td colSpan={4} className="right">{fmt(total, currency)}</td>
            </tr>

            {/* Exchange rate row for export */}
            {isExport && proforma.exchangeRate && (
              <tr>
                <td colSpan={8} className="right">
                  Total Invoice Amount in ₹&nbsp;
                  {fmt(total, 'USD')} @ ₹{proforma.exchangeRate}/$ = ₹{(total * proforma.exchangeRate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* ── Amount in Words ── */}
        <table style={{ marginBottom: 4 }}>
          <tbody>
            <tr>
              <td colSpan={2}>
                <span className="bold">Amount Chargeable (in words): </span>
                {isExport
                  ? amountToWords(total, 'USD') + (proforma.exchangeRate ? ` / ${amountToWords(total * proforma.exchangeRate, 'INR')}` : '')
                  : amountToWords(total, 'INR')
                }
              </td>
              <td className="right small">E. &amp; O.E</td>
            </tr>
          </tbody>
        </table>

        {/* ── Declaration + Bank + Signature ── */}
        <table>
          <tbody>
            <tr>
              <td style={{ width: '55%' }}>
                <div className="bold small">Company's Bank Details</div>
                <div className="small">
                  <div><span className="bold">A/c Holder's Name:</span> {s('bank_holder')}</div>
                  <div><span className="bold">Bank Name:</span> {s('bank_name')}</div>
                  <div><span className="bold">A/c No.:</span> {s('bank_account')}</div>
                  <div><span className="bold">Branch &amp; IFS Code:</span> {s('bank_branch')} &amp; {s('bank_ifsc')}</div>
                  {isExport && <div><span className="bold">SWIFT Code:</span> {s('bank_swift')}</div>}
                </div>
                <div style={{ height: 8 }} />
                <div className="bold small">Declaration</div>
                <div className="small">
                  We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
                </div>
              </td>
              <td style={{ width: '45%', textAlign: 'right' }}>
                <div className="small" style={{ marginBottom: 40 }}>for {coName}</div>
                <div className="bold small">Authorised Signatory</div>
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="center small" style={{ background: '#f9f9f9' }}>
                This is a Computer Generated Invoice
              </td>
            </tr>
          </tbody>
        </table>

        {proforma.notes && (
          <div style={{ marginTop: 6, fontSize: 10, borderTop: '1px solid #ccc', paddingTop: 4 }}>
            <span className="bold">Notes: </span>{proforma.notes}
          </div>
        )}
      </div>
    </>
  );
}
