'use client';

import { Barcode128 } from '@/components/Barcode128';
import { Check } from 'lucide-react';

/* ── Types ── */
type RawMaterial = {
  barcode: string | null;
  name: string;
  unit: string;
  purchaseUnit: string | null;
  conversionFactor: number | null;
  category: { name: string; code: string } | null;
};

type JobCardItem = {
  id: string;
  quantityReq: number;
  quantityIssued: number;
  isCritical: boolean;
  verifiedQty: number;
  isVerified: boolean;
  rawMaterial: RawMaterial;
};

type JobCard = {
  id: string;
  cardNumber: string;
  stage: string;
  status: string;
  dispatchType: string | null;
  orderQuantity: number;
  notes: string | null;
  createdAt: string | Date;
  dispatchedAt: string | Date | null;
  order: {
    orderNumber: string;
    quantity: number;
    voltage: string | null;
    product: { code: string; name: string };
    client:  { customerName: string; code: string } | null;
  };
  createdBy:    { name: string };
  dispatchedBy: { name: string } | null;
  items: JobCardItem[];
};

type Settings = Record<string, string>;

/* ── Helpers ── */
const STAGE_LABEL: Record<string, string> = {
  POWERSTAGE_MANUFACTURING:  'Powerstage Manufacturing',
  BRAINBOARD_MANUFACTURING:  'Brainboard Manufacturing',
  CONTROLLER_ASSEMBLY:       'Controller Assembly',
  QC_AND_SOFTWARE:           'QC & Software',
  REWORK:                    'Rework',
  FINAL_ASSEMBLY:            'Final Assembly',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING:   'Pending',
  ISSUED:    'Issued',
  ACTIVE:    'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING:   '#92400e',
  ISSUED:    '#1e40af',
  ACTIVE:    '#166534',
  COMPLETED: '#374151',
  CANCELLED: '#991b1b',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(d: string | Date) {
  const dt = new Date(d);
  return `${String(dt.getDate()).padStart(2,'0')} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}

function fmtDateTime(d: string | Date) {
  const dt = new Date(d);
  const h = dt.getHours(); const m = dt.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${fmtDate(dt)} · ${String(h12).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ampm}`;
}

function displayQty(item: JobCardItem, field: 'quantityReq' | 'quantityIssued' | 'verifiedQty') {
  const qty = item[field];
  const m   = item.rawMaterial;
  if (!qty && field !== 'quantityReq') return '—';
  const unit = m.unit || 'PCS';
  // If purchase unit differs from base unit and there's a conversion factor, show pack info
  if (m.purchaseUnit && m.conversionFactor && m.conversionFactor > 1 && unit !== m.purchaseUnit) {
    const packs = qty / m.conversionFactor;
    if (packs % 1 === 0) {
      return `${qty} ${unit} (${packs} ${m.purchaseUnit})`;
    }
  }
  return `${qty} ${unit}`;
}

/* ── Component ── */
export function PrintJobCard({
  jobCard,
  settings,
}: {
  jobCard: JobCard;
  settings: Settings;
}) {
  const s      = (k: string) => settings[k] ?? '';
  const coName = s('company_name') || 'SMX Drives';
  const order  = jobCard.order;

  const isDispatched = !!jobCard.dispatchedAt;
  const isPartial    = jobCard.dispatchType === 'PARTIAL';
  const isFull       = jobCard.dispatchType === 'FULL';

  const criticalItems    = jobCard.items.filter((i) => i.isCritical);
  const nonCriticalItems = jobCard.items.filter((i) => !i.isCritical);
  const totalItems       = jobCard.items.length;
  const issuedItems      = jobCard.items.filter((i) => i.quantityIssued > 0).length;

  const ItemRow = ({ item, idx }: { item: JobCardItem; idx: number }) => (
    <tr>
      <td className="c" style={{ fontWeight: 600, color: '#555' }}>{idx + 1}</td>
      <td>
        <div style={{ fontWeight: 600, fontSize: 9 }}>{item.rawMaterial.name}</div>
        {item.rawMaterial.category && (
          <div style={{ fontSize: 7.5, color: '#777', marginTop: 1 }}>{item.rawMaterial.category.name}</div>
        )}
      </td>
      <td className="c" style={{ fontWeight: 700 }}>{displayQty(item, 'quantityReq')}</td>
      <td className="c" style={{ color: item.quantityIssued > 0 ? '#166534' : '#aaa', fontWeight: 600 }}>
        {displayQty(item, 'quantityIssued')}
      </td>
      <td className="c">
        {/* Blank box for physical verification check */}
        <div style={{ width: 14, height: 14, border: '1.5px solid #374151', borderRadius: 2, margin: '0 auto' }} />
      </td>
    </tr>
  );

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

        .page-wrap { border: 1.5px solid #1a3a6b; min-height: 277mm; display: flex; flex-direction: column; }

        .hdr { display: flex; justify-content: space-between; align-items: stretch; border-bottom: 1.5px solid #1a3a6b; }
        .hdr-left { padding: 10px 12px; flex: 1; }
        .hdr-right { padding: 10px 14px; text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; border-left: 1px solid #c8d8f0; min-width: 210px; }
        .co-name { font-size: 15px; font-weight: 700; color: #1a3a6b; }
        .co-tagline { font-size: 8px; color: #555; margin-top: 1px; }
        .co-addr { font-size: 8.5px; color: #333; margin-top: 4px; line-height: 1.55; }
        .co-gstin { font-size: 8px; color: #555; margin-top: 3px; }
        .doc-title { font-size: 13px; font-weight: 800; color: #1a3a6b; letter-spacing: 1px; text-transform: uppercase; }
        .doc-number { font-size: 11px; font-weight: 700; color: #1a3a6b; margin-top: 4px; }

        .info-bar { display: grid; border-bottom: 1px solid #c8d8f0; background: #f0f5ff; }
        .info-bar-4 { grid-template-columns: repeat(4, 1fr); }
        .info-bar-3 { grid-template-columns: repeat(3, 1fr); }
        .info-cell { padding: 6px 10px; }
        .info-cell:not(:last-child) { border-right: 1px solid #c8d8f0; }
        .info-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #1a3a6b; margin-bottom: 2px; }
        .info-value { font-size: 10px; color: #111; font-weight: 600; }
        .info-bar-2 { background: #fafbfd; }

        .section-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #fff; background: #1a3a6b; padding: 4px 10px; }
        table { width: 100%; border-collapse: collapse; }
        thead th { background: #1a3a6b; color: #fff; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 5px 7px; border-right: 1px solid #2a5099; }
        thead th:last-child { border-right: none; }
        thead th.c { text-align: center; }
        tbody tr { border-bottom: 1px solid #e8edf5; }
        tbody tr:nth-child(even) { background: #f7f9fd; }
        tbody td { padding: 5px 7px; font-size: 9px; color: #111; vertical-align: middle; }
        tbody td.c { text-align: center; }
        .group-header td { background: #e8edf8; font-size: 8px; font-weight: 700; color: #1a3a6b; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 7px; border-top: 1px solid #c8d8f0; }

        .footer-row { display: grid; grid-template-columns: 1fr 1fr 1fr; border-top: 1.5px solid #1a3a6b; margin-top: auto; }
        .footer-col { padding: 8px 10px; }
        .footer-col:not(:last-child) { border-right: 1px solid #c8d8f0; }
        .f-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #1a3a6b; margin-bottom: 4px; }
        .sign-line { border-top: 1px solid #1a3a6b; padding-top: 3px; font-size: 8px; font-weight: 700; color: #1a3a6b; margin-top: 28px; }
        .comp-gen { text-align: center; font-size: 7.5px; color: #999; padding: 4px; background: #f8faff; border-top: 1px solid #e8edf5; }
        .badge { display: inline-block; font-size: 7px; font-weight: 700; padding: 2px 7px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #fff; }
        .partial-banner { background: #fffbeb; border-bottom: 1px solid #fcd34d; padding: 5px 12px; font-size: 8.5px; color: #92400e; font-weight: 600; }
      `}</style>

      {/* Screen controls */}
      <div className="no-print" style={{ padding: '10px 16px', background: '#18181b', display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={() => window.print()}
          style={{ background: '#1a3a6b', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          Print / Save PDF
        </button>
        <button onClick={() => window.close()}
          style={{ background: '#3f3f46', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
          Close
        </button>
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
              {s('company_gstin')      && <>GSTIN: <strong>{s('company_gstin')}</strong></>}
              {s('company_state_code') && <>&nbsp;&nbsp;|&nbsp;&nbsp;State Code: <strong>{s('company_state_code')}</strong></>}
              {s('company_phone')      && <>&nbsp;&nbsp;|&nbsp;&nbsp;Ph: {s('company_phone')}</>}
            </div>
          </div>
          <div className="hdr-right">
            <div className="doc-title">Job Card</div>
            <div className="doc-number">{jobCard.cardNumber}</div>
            <div style={{ marginTop: 6 }}>
              <Barcode128 value={jobCard.cardNumber} width={1.4} height={36} fontSize={9}
                background="#ffffff" lineColor="#000000" />
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: STATUS_COLOR[jobCard.status] ?? '#374151' }}>
                {STATUS_LABEL[jobCard.status] ?? jobCard.status}
              </span>
              {isFull    && <span className="badge" style={{ background: '#166534' }}>Full Dispatch</span>}
              {isPartial && <span className="badge" style={{ background: '#d97706' }}>Partial Dispatch</span>}
            </div>
          </div>
        </div>

        {/* ── PARTIAL WARNING BANNER ── */}
        {isPartial && (
          <div className="partial-banner">
            ⚠ Partial Dispatch — Some non-critical materials were unavailable. Verify items received against issued quantities below.
          </div>
        )}

        {/* ── INFO BAR 1 ── */}
        <div className="info-bar info-bar-3">
          <div className="info-cell">
            <div className="info-label">Job Card #</div>
            <div className="info-value">{jobCard.cardNumber}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Order #</div>
            <div className="info-value">{order.orderNumber}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Date</div>
            <div className="info-value">{fmtDate(jobCard.createdAt)}</div>
          </div>
        </div>

        {/* ── INFO BAR 2 ── */}
        <div className="info-bar info-bar-3 info-bar-2">
          <div className="info-cell">
            <div className="info-label">Product</div>
            <div className="info-value">{order.product.code}</div>
            <div style={{ fontSize: 8, color: '#555', marginTop: 1 }}>{order.product.name}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Prepared By</div>
            <div className="info-value">{jobCard.createdBy.name}</div>
          </div>
          <div className="info-cell" />
        </div>

        {/* ── DISPATCHED BY ROW (shown if dispatched) ── */}
        {isDispatched && (
          <div className="info-bar info-bar-3 info-bar-2" style={{ borderTop: '1px solid #c8d8f0' }}>
            <div className="info-cell">
              <div className="info-label">Dispatched By (IM)</div>
              <div className="info-value">{jobCard.dispatchedBy?.name ?? '—'}</div>
            </div>
            <div className="info-cell">
              <div className="info-label">Dispatched At</div>
              <div className="info-value">{jobCard.dispatchedAt ? fmtDateTime(jobCard.dispatchedAt) : '—'}</div>
            </div>
            <div className="info-cell">
              <div className="info-label">Dispatch Type</div>
              <div className="info-value" style={{ color: isPartial ? '#d97706' : '#166534' }}>
                {isPartial ? 'Partial' : 'Full'}
              </div>
            </div>
          </div>
        )}

        {/* ── MATERIALS TABLE ── */}
        <div className="section-title" style={{ marginTop: 6 }}>
          Materials List ({totalItems} items)
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '6%'  }} className="c">#</th>
              <th style={{ width: '46%' }}>Component / Material</th>
              <th style={{ width: '18%' }} className="c">Qty Required</th>
              <th style={{ width: '18%' }} className="c">Qty Issued</th>
              <th style={{ width: '12%' }} className="c">Rcvd <Check className="w-4 h-4 ml-1 inline" /></th>
            </tr>
          </thead>
          <tbody>
            {criticalItems.length > 0 && (
              <>
                <tr className="group-header">
                  <td colSpan={5}>Critical Components ({criticalItems.length})</td>
                </tr>
                {criticalItems.map((item, idx) => (
                  <ItemRow key={item.id} item={item} idx={idx} />
                ))}
              </>
            )}
            {nonCriticalItems.length > 0 && (
              <>
                <tr className="group-header">
                  <td colSpan={5}>Optional Components ({nonCriticalItems.length})</td>
                </tr>
                {nonCriticalItems.map((item, idx) => (
                  <ItemRow key={item.id} item={item} idx={criticalItems.length + idx} />
                ))}
              </>
            )}
          </tbody>
        </table>

        {/* ── NOTES ── */}
        {jobCard.notes && (
          <div style={{ padding: '6px 10px', background: '#fffbeb', borderTop: '1px solid #fcd34d', fontSize: 8.5, color: '#78350f' }}>
            <strong>Notes:</strong> {jobCard.notes}
          </div>
        )}

        {/* ── FOOTER ── */}
        <div className="footer-row" style={{ marginTop: 'auto' }}>
          <div className="footer-col">
            <div className="f-label">Created By (PM / Employee)</div>
            <div style={{ fontSize: 9, color: '#333' }}>{jobCard.createdBy.name}</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>{fmtDate(jobCard.createdAt)}</div>
            <div className="sign-line">Signature</div>
          </div>
          <div className="footer-col">
            <div className="f-label">Issued By (Inventory Manager)</div>
            {jobCard.dispatchedBy
              ? <><div style={{ fontSize: 9, color: '#333' }}>{jobCard.dispatchedBy.name}</div>
                  <div style={{ fontSize: 8, color: '#888', marginTop: 2 }}>{jobCard.dispatchedAt ? fmtDate(jobCard.dispatchedAt) : ''}</div></>
              : <div style={{ fontSize: 8.5, color: '#aaa', fontStyle: 'italic' }}>Pending issuance</div>}
            <div className="sign-line">Signature</div>
          </div>
          <div className="footer-col">
            <div className="f-label">Received By (Production Employee)</div>
            <div style={{ fontSize: 8, color: '#aaa', fontStyle: 'italic', marginBottom: 4 }}>Verify all items on receipt</div>
            <div className="sign-line">Signature</div>
          </div>
        </div>

        <div className="comp-gen">SMX Production System — Internal Job Card · {jobCard.cardNumber}</div>

      </div>
    </>
  );
}
