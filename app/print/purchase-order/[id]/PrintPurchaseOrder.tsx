'use client';

import { useEffect } from 'react';

type POItem = {
  id: string;
  rawMaterialId: string | null;
  itemDescription: string | null;
  itemUnit: string | null;
  quantity: number;
  unitPrice: number;
  receivedQuantity: number;
  rawMaterial: { name: string; code: string; unit: string } | null;
};

type PO = {
  id: string;
  poNumber: string;
  status: string;
  totalAmount: number;
  currency: string;
  expectedDelivery: string | null;
  notes: string | null;
  createdAt: string;
  approvedAt: string | null;
  vendor: {
    name: string;
    code: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    gstNumber: string | null;
  };
  createdBy: { name: string };
  approvedBy: { name: string } | null;
  rfq: { rfqNumber: string; title: string; paymentTerms: string | null } | null;
  items: POItem[];
};

type Settings = Record<string, string>;

function fmt(amount: number, currency: string) {
  if (currency === 'USD') return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `\u20b9${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${String(dt.getUTCDate()).padStart(2,'0')} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

export function PrintPurchaseOrder({ po, settings }: { po: PO; settings: Settings }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  const sym = po.currency === 'USD' ? '$' : '₹';
  const subtotal = po.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; background: #fff; }
        @page { size: A4 portrait; margin: 14mm 14mm 14mm 14mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        .page { width: 100%; max-width: 794px; margin: 0 auto; padding: 0; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 14px; }
        .company-name { font-size: 17px; font-weight: 700; color: #1e3a5f; }
        .company-sub { font-size: 10px; color: #555; margin-top: 2px; line-height: 1.5; }
        .po-title { text-align: right; }
        .po-title h1 { font-size: 20px; font-weight: 800; color: #1e3a5f; letter-spacing: 1px; }
        .po-title .po-num { font-size: 13px; font-weight: 600; color: #333; margin-top: 3px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
        .info-box { border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 10px; }
        .info-box h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 5px; }
        .info-row { display: flex; gap: 6px; margin-bottom: 2px; }
        .info-label { font-size: 10px; color: #666; min-width: 80px; }
        .info-val { font-size: 10px; color: #1a1a1a; font-weight: 500; }
        .vendor-name { font-size: 12px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        thead tr { background: #1e3a5f; }
        thead th { color: #fff; font-size: 10px; font-weight: 600; padding: 7px 8px; text-align: left; }
        thead th:last-child, thead th:nth-child(3), thead th:nth-child(4) { text-align: right; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        tbody td { font-size: 10px; padding: 6px 8px; border-bottom: 1px solid #e8ecf0; vertical-align: top; }
        tbody td:last-child, tbody td:nth-child(3), tbody td:nth-child(4) { text-align: right; }
        .totals { margin-left: auto; width: 220px; margin-bottom: 14px; }
        .totals-row { display: flex; justify-content: space-between; font-size: 10px; padding: 3px 0; border-bottom: 1px solid #eee; }
        .totals-row.total { font-size: 12px; font-weight: 700; color: #1e3a5f; border-top: 2px solid #1e3a5f; border-bottom: none; padding-top: 6px; }
        .terms-section { border: 1px solid #e2e8f0; border-radius: 4px; padding: 8px 10px; margin-bottom: 14px; }
        .terms-section h3 { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 5px; }
        .terms-section p { font-size: 10px; color: #333; line-height: 1.5; }
        .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 24px; }
        .sig-box { border-top: 1px solid #ccc; padding-top: 6px; }
        .sig-box .sig-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
        .sig-box .sig-name { font-size: 10px; font-weight: 600; margin-top: 2px; }
        .footer { border-top: 1px solid #e2e8f0; padding-top: 6px; text-align: center; font-size: 9px; color: #999; margin-top: 16px; }
        .badge { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 9px; font-weight: 600; }
        .badge-approved { background: #dcfce7; color: #166534; }
        .badge-draft { background: #fef3c7; color: #92400e; }
      `}</style>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div>
            <div className="company-name">{settings.company_name ?? 'Three Shul Motors Pvt.Ltd.'}</div>
            <div className="company-sub">
              {settings.company_address?.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}<br />
              GSTIN: {settings.company_gstin} &nbsp;|&nbsp; Ph: {settings.company_phone}
            </div>
          </div>
          <div className="po-title">
            <h1>PURCHASE ORDER</h1>
            <div className="po-num">{po.poNumber}</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
              Date: {fmtDate(po.createdAt)}
            </div>
            <div style={{ marginTop: 4 }}>
              <span className={`badge ${po.status === 'APPROVED' || po.status === 'CONFIRMED' ? 'badge-approved' : 'badge-draft'}`}>
                {po.status}
              </span>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="info-grid">
          {/* Vendor */}
          <div className="info-box">
            <h3>Vendor / Supplier</h3>
            <div className="vendor-name">{po.vendor.name} ({po.vendor.code})</div>
            {po.vendor.address && <div style={{ fontSize: 10, color: '#555', lineHeight: 1.4, marginBottom: 4 }}>{po.vendor.address}</div>}
            {po.vendor.gstNumber && (
              <div className="info-row">
                <span className="info-label">GSTIN</span>
                <span className="info-val">{po.vendor.gstNumber}</span>
              </div>
            )}
            {po.vendor.email && (
              <div className="info-row">
                <span className="info-label">Email</span>
                <span className="info-val">{po.vendor.email}</span>
              </div>
            )}
            {po.vendor.phone && (
              <div className="info-row">
                <span className="info-label">Phone</span>
                <span className="info-val">{po.vendor.phone}</span>
              </div>
            )}
          </div>

          {/* PO Details */}
          <div className="info-box">
            <h3>Order Details</h3>
            {po.rfq && (
              <div className="info-row">
                <span className="info-label">RFQ Ref.</span>
                <span className="info-val">{po.rfq.rfqNumber}</span>
              </div>
            )}
            <div className="info-row">
              <span className="info-label">Currency</span>
              <span className="info-val">{po.currency}</span>
            </div>
            {po.expectedDelivery && (
              <div className="info-row">
                <span className="info-label">Delivery By</span>
                <span className="info-val" style={{ fontWeight: 700 }}>{fmtDate(po.expectedDelivery)}</span>
              </div>
            )}
            {po.rfq?.paymentTerms && (
              <div className="info-row">
                <span className="info-label">Payment</span>
                <span className="info-val">{po.rfq.paymentTerms}</span>
              </div>
            )}
            <div className="info-row">
              <span className="info-label">Raised By</span>
              <span className="info-val">{po.createdBy.name}</span>
            </div>
            {po.approvedBy && (
              <div className="info-row">
                <span className="info-label">Approved By</span>
                <span className="info-val">{po.approvedBy.name}</span>
              </div>
            )}
            {po.approvedAt && (
              <div className="info-row">
                <span className="info-label">Approved On</span>
                <span className="info-val">{fmtDate(po.approvedAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Line Items */}
        <table>
          <thead>
            <tr>
              <th style={{ width: '5%' }}>#</th>
              <th style={{ width: '40%' }}>Item / Description</th>
              <th style={{ width: '12%' }}>Unit</th>
              <th style={{ width: '12%' }}>Qty</th>
              <th style={{ width: '15%' }}>Unit Price</th>
              <th style={{ width: '16%' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {po.items.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#999', padding: '16px' }}>No line items</td>
              </tr>
            ) : (
              po.items.map((item, idx) => {
                const name = item.rawMaterial?.name ?? item.itemDescription ?? 'Custom Item';
                const unit = item.rawMaterial?.unit ?? item.itemUnit ?? '—';
                const amt = item.quantity * item.unitPrice;
                return (
                  <tr key={item.id}>
                    <td>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{name}</div>
                      {item.rawMaterial?.code && <div style={{ fontSize: 9, color: '#888' }}>Code: {item.rawMaterial.code}</div>}
                    </td>
                    <td>{unit}</td>
                    <td>{item.quantity}</td>
                    <td>{fmt(item.unitPrice, po.currency)}</td>
                    <td>{fmt(amt, po.currency)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="totals">
          <div className="totals-row">
            <span>Subtotal</span>
            <span>{fmt(subtotal, po.currency)}</span>
          </div>
          <div className="totals-row total">
            <span>Total</span>
            <span>{fmt(po.totalAmount, po.currency)}</span>
          </div>
        </div>

        {/* Terms & Notes */}
        {(po.rfq?.paymentTerms || po.notes) && (
          <div className="terms-section">
            <h3>Terms & Notes</h3>
            {po.rfq?.paymentTerms && <p style={{ marginBottom: po.notes ? 4 : 0 }}><strong>Payment Terms:</strong> {po.rfq.paymentTerms}</p>}
            {po.notes && <p>{po.notes}</p>}
          </div>
        )}

        {/* Standard terms */}
        <div className="terms-section">
          <h3>Standard Terms</h3>
          <p>
            1. Please confirm receipt of this Purchase Order within 2 working days.<br />
            2. All goods/services must conform to specifications. Non-conforming items will be returned at vendor's cost.<br />
            3. Invoice must quote this PO number: <strong>{po.poNumber}</strong>.<br />
            4. Delivery must be completed by the date specified above. Delays must be communicated in advance.
          </p>
        </div>

        {/* Signatures */}
        <div className="sig-grid">
          <div className="sig-box">
            <div className="sig-label">Prepared By</div>
            <div className="sig-name">{po.createdBy.name}</div>
            <div style={{ marginTop: 20, borderTop: '1px solid #ccc', paddingTop: 4, fontSize: 9, color: '#999' }}>Signature &amp; Date</div>
          </div>
          <div className="sig-box">
            <div className="sig-label">Authorised Signatory</div>
            <div className="sig-name">{settings.company_name ?? ''}</div>
            <div style={{ marginTop: 20, borderTop: '1px solid #ccc', paddingTop: 4, fontSize: 9, color: '#999' }}>Signature &amp; Date</div>
          </div>
        </div>

        <div className="footer">
          {settings.company_name} &nbsp;·&nbsp; GSTIN: {settings.company_gstin} &nbsp;·&nbsp; {settings.company_address?.split('\n')[0]}
        </div>
      </div>

      {/* Print button — hidden on print */}
      <div className="no-print" style={{ position: 'fixed', bottom: 24, right: 24, display: 'flex', gap: 8 }}>
        <button onClick={() => window.print()}
          style={{ padding: '10px 20px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Print / Save PDF
        </button>
        <button onClick={() => window.close()}
          style={{ padding: '10px 16px', background: '#e2e8f0', color: '#333', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          Close
        </button>
      </div>
    </>
  );
}
