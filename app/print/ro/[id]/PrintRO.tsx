'use client';

import { useEffect } from 'react';

type ROItem = {
  id: string;
  materialId?: string | null;
  itemDescription?: string | null;
  itemUnit?: string | null;
  qtyRequired: number;
  qtyOrdered: number;
  notes?: string | null;
  material?: { id: string; name: string; code: string; unit: string; currentStock: number } | null;
};

type RO = {
  id: string;
  roNumber: string;
  trigger: string;
  status: string;
  notes?: string | null;
  createdAt: string | Date;
  approvedAt?: string | Date | null;
  approvedBy?: { name: string } | null;
  jobCard?: { cardNumber: string } | null;
  items: ROItem[];
};

type Settings = Record<string, string>;

export function PrintRO({ ro, settings }: { ro: RO; settings: Settings }) {
  useEffect(() => { window.print(); }, []);

  const companyName    = settings.company_name    ?? 'Three Shul Motors Pvt.Ltd.';
  const companyAddress = settings.company_address ?? '';
  const companyGstin   = settings.company_gstin   ?? '';
  const companyPhone   = settings.company_phone   ?? '';
  const companyEmail   = settings.company_email   ?? '';

  const createdDate = new Date(ro.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const approvedDate = ro.approvedAt ? new Date(ro.approvedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

  const triggerLabel: Record<string, string> = {
    LOW_STOCK: 'Low Stock',
    JOB_CARD: 'Job Card',
    MANUAL: 'Manual',
  };

  return (
    <html>
      <head>
        <title>{ro.roNumber}</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }
          @page { size: A4 portrait; margin: 15mm 15mm 15mm 15mm; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

          .page { width: 100%; }

          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
          .company-name { font-size: 16px; font-weight: 700; margin-bottom: 3px; }
          .company-detail { font-size: 9.5px; color: #444; line-height: 1.5; }
          .doc-title { text-align: right; }
          .doc-title h1 { font-size: 18px; font-weight: 700; letter-spacing: 1px; }
          .doc-title .ro-num { font-size: 13px; font-weight: 600; color: #1a56db; margin-top: 2px; }

          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; background: #f7f7f7; border: 1px solid #ddd; border-radius: 4px; padding: 10px 12px; margin-bottom: 14px; }
          .meta-row { display: flex; gap: 6px; }
          .meta-label { font-weight: 600; color: #555; min-width: 80px; font-size: 10px; }
          .meta-value { color: #111; font-size: 10px; }
          .badge { display: inline-block; padding: 1px 7px; border-radius: 3px; font-size: 9.5px; font-weight: 600; }
          .badge-pending  { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
          .badge-approved { background: #dbeafe; color: #1e40af; border: 1px solid #93c5fd; }
          .badge-converted{ background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd; }
          .badge-manual   { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
          .badge-low      { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
          .badge-job      { background: #ede9fe; color: #5b21b6; border: 1px solid #c4b5fd; }

          .notes-box { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 4px; padding: 7px 10px; margin-bottom: 14px; font-size: 10px; }
          .notes-box strong { font-size: 9.5px; text-transform: uppercase; color: #92400e; display: block; margin-bottom: 2px; }

          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          thead th { background: #1a56db; color: #fff; padding: 7px 8px; text-align: left; font-size: 10px; font-weight: 600; }
          thead th:last-child { text-align: right; }
          tbody tr:nth-child(even) { background: #f9fafb; }
          tbody td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; font-size: 10px; vertical-align: top; }
          tbody td:last-child { text-align: right; }
          .item-name { font-weight: 600; }
          .item-code { font-size: 9px; color: #888; }
          .item-tag { display: inline-block; font-size: 8.5px; padding: 1px 5px; border-radius: 2px; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; margin-top: 2px; }
          .item-notes { font-size: 9px; color: #666; font-style: italic; margin-top: 2px; }

          .footer { border-top: 1px solid #ddd; padding-top: 10px; display: flex; justify-content: space-between; align-items: flex-end; }
          .sig-block { text-align: center; }
          .sig-line { width: 120px; border-bottom: 1px solid #111; margin-bottom: 4px; height: 30px; }
          .sig-label { font-size: 9px; color: #555; }
          .print-note { font-size: 8.5px; color: #aaa; text-align: right; }
        `}</style>
      </head>
      <body>
        <div className="page">
          {/* Header */}
          <div className="header">
            <div>
              <div className="company-name">{companyName}</div>
              <div className="company-detail" style={{ whiteSpace: 'pre-line' }}>{companyAddress}</div>
              <div className="company-detail">GSTIN: {companyGstin} &nbsp;|&nbsp; {companyPhone} &nbsp;|&nbsp; {companyEmail}</div>
            </div>
            <div className="doc-title">
              <h1>REQUIREMENT ORDER</h1>
              <div className="ro-num">{ro.roNumber}</div>
            </div>
          </div>

          {/* Meta */}
          <div className="meta-grid">
            <div className="meta-row">
              <span className="meta-label">Date:</span>
              <span className="meta-value">{createdDate}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Status:</span>
              <span className="meta-value">
                <span className={`badge badge-${ro.status.toLowerCase()}`}>{ro.status}</span>
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Trigger:</span>
              <span className="meta-value">
                <span className={`badge ${ro.trigger === 'LOW_STOCK' ? 'badge-low' : ro.trigger === 'JOB_CARD' ? 'badge-job' : 'badge-manual'}`}>
                  {triggerLabel[ro.trigger] ?? ro.trigger}
                </span>
              </span>
            </div>
            {ro.jobCard && (
              <div className="meta-row">
                <span className="meta-label">Job Card:</span>
                <span className="meta-value">{ro.jobCard.cardNumber}</span>
              </div>
            )}
            {ro.approvedBy && (
              <>
                <div className="meta-row">
                  <span className="meta-label">Approved by:</span>
                  <span className="meta-value">{ro.approvedBy.name}</span>
                </div>
                {approvedDate && (
                  <div className="meta-row">
                    <span className="meta-label">Approved on:</span>
                    <span className="meta-value">{approvedDate}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Notes */}
          {ro.notes && (
            <div className="notes-box">
              <strong>Purpose / Notes</strong>
              {ro.notes}
            </div>
          )}

          {/* Items Table */}
          <table>
            <thead>
              <tr>
                <th style={{ width: '5%' }}>#</th>
                <th style={{ width: '40%' }}>Item / Description</th>
                <th style={{ width: '15%' }}>Code</th>
                <th style={{ width: '15%' }}>Current Stock</th>
                <th style={{ width: '12%' }}>Unit</th>
                <th style={{ width: '13%' }}>Qty Required</th>
              </tr>
            </thead>
            <tbody>
              {ro.items.map((item, idx) => (
                <tr key={item.id}>
                  <td>{idx + 1}</td>
                  <td>
                    <div className="item-name">
                      {item.material ? item.material.name : item.itemDescription}
                    </div>
                    {!item.material && <span className="item-tag">Consumable / Maintenance</span>}
                    {item.notes && <div className="item-notes">{item.notes}</div>}
                  </td>
                  <td className="item-code">{item.material?.code ?? '—'}</td>
                  <td>{item.material ? `${item.material.currentStock} ${item.material.unit}` : '—'}</td>
                  <td>{item.material ? item.material.unit : (item.itemUnit ?? '—')}</td>
                  <td style={{ fontWeight: 600 }}>{item.qtyRequired}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer */}
          <div className="footer">
            <div className="sig-block">
              <div className="sig-line" />
              <div className="sig-label">Requested by</div>
            </div>
            <div className="sig-block">
              <div className="sig-line" />
              <div className="sig-label">Inventory Manager</div>
            </div>
            <div className="sig-block">
              <div className="sig-line" />
              <div className="sig-label">Purchase Manager</div>
            </div>
            <div className="print-note">
              Printed on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
