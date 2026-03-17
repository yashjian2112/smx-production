'use client';

import { useEffect } from 'react';
import { Barcode128 } from '@/components/Barcode128';

/* ── Types ── */
type BoxSize = {
  name: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

type BoxItem = {
  id: string;
  unit: { serialNumber: string; finalAssemblyBarcode: string | null };
};

type Box = {
  id: string;
  boxNumber: number;
  boxLabel: string;
  isSealed: boolean;
  weightKg: number | null;
  boxSize: BoxSize | null;
  items: BoxItem[];
};

type Order = {
  orderNumber: string;
  quantity: number;
  client: {
    customerName: string;
    state: string | null;
    phone: string | null;
    shippingAddress: string | null;
  } | null;
  product: { code: string; name: string };
};

type DispatchOrder = {
  id: string;
  doNumber: string;
  status: string;
  createdAt: string | Date;
  approvedAt: string | Date | null;
  createdBy:  { name: string };
  approvedBy: { name: string } | null;
  order: Order;
  boxes: Box[];
};

type Settings = Record<string, string>;

/* ── Helpers ── */
function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_LABEL: Record<string, string> = {
  OPEN:      'Open',
  PACKING:   'In Packing',
  SUBMITTED: 'Pending Approval',
  APPROVED:  'Dispatched',
  REJECTED:  'Rejected',
};

const STATUS_COLOR: Record<string, string> = {
  OPEN:      '#92400e',
  PACKING:   '#1e3a6e',
  SUBMITTED: '#5b21b6',
  APPROVED:  '#166534',
  REJECTED:  '#991b1b',
};

export function PrintDispatchOrder({
  dispatchOrder,
  settings,
}: {
  dispatchOrder: DispatchOrder;
  settings: Settings;
}) {
  const s     = (k: string) => settings[k] ?? '';
  const coName = s('company_name') || 'SMX Drives';

  const order = dispatchOrder.order;

  /* Units come from boxes — only units actually in THIS dispatch order */
  const doUnits = dispatchOrder.boxes.flatMap((box) =>
    box.items.map((item) => ({
      serialNumber:        item.unit.serialNumber,
      finalAssemblyBarcode: item.unit.finalAssemblyBarcode,
      boxNumber:           box.boxNumber,
      boxLabel:            box.boxLabel,
    }))
  );

  const totalBoxes   = dispatchOrder.boxes.length;
  const totalUnits   = doUnits.length;
  const isDispatched = dispatchOrder.status === 'APPROVED';

  /* Date shown: Dispatch Date (approvedAt) if dispatched, else Created Date */
  const docDate  = isDispatched && dispatchOrder.approvedAt
    ? fmtDate(dispatchOrder.approvedAt)
    : fmtDate(dispatchOrder.createdAt);
  const dateLabel = isDispatched ? 'Dispatch Date' : 'Date Created';

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

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
        .hdr-right { padding: 10px 14px; text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; border-left: 1px solid #c8d8f0; min-width: 200px; }
        .co-name { font-size: 15px; font-weight: 700; color: #1a3a6b; letter-spacing: 0.3px; }
        .co-tagline { font-size: 8px; color: #555; margin-top: 1px; }
        .co-addr { font-size: 8.5px; color: #333; margin-top: 4px; line-height: 1.55; }
        .co-gstin { font-size: 8px; color: #555; margin-top: 3px; }
        .doc-title { font-size: 13px; font-weight: 800; color: #1a3a6b; letter-spacing: 1px; text-transform: uppercase; }
        .doc-number { font-size: 11px; font-weight: 700; color: #1a3a6b; margin-top: 5px; }
        .doc-barcode { margin-top: 6px; }

        .info-bar { display: grid; grid-template-columns: repeat(4, 1fr); border-bottom: 1px solid #c8d8f0; background: #f0f5ff; }
        .info-cell { padding: 5px 10px; }
        .info-cell:not(:last-child) { border-right: 1px solid #c8d8f0; }
        .info-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #1a3a6b; margin-bottom: 1.5px; }
        .info-value { font-size: 9.5px; color: #111; font-weight: 600; }

        .info-bar-2 { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid #c8d8f0; background: #fafbfd; }

        .section-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #fff; background: #1a3a6b; padding: 4px 10px; border-bottom: 1px solid #1a3a6b; }

        table { width: 100%; border-collapse: collapse; }
        thead th { background: #1a3a6b; color: #fff; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 7px; border-right: 1px solid #2a5099; }
        thead th:last-child { border-right: none; }
        thead th.c { text-align: center; }
        thead th.r { text-align: right; }
        tbody tr { border-bottom: 1px solid #e8edf5; }
        tbody tr:nth-child(even) { background: #f7f9fd; }
        tbody td { padding: 5px 7px; font-size: 9px; color: #111; vertical-align: middle; }
        tbody td.c { text-align: center; }
        tbody td.r { text-align: right; }

        .status-badge { display: inline-block; font-size: 7.5px; font-weight: 700; padding: 2px 7px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #fff; }

        .footer-row { display: grid; grid-template-columns: 1fr 1fr; border-top: 1.5px solid #1a3a6b; margin-top: auto; }
        .footer-col { padding: 8px 10px; }
        .footer-col:first-child { border-right: 1px solid #c8d8f0; }
        .f-label { font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #1a3a6b; margin-bottom: 4px; }
        .sign-line { border-top: 1px solid #1a3a6b; padding-top: 3px; font-size: 8.5px; font-weight: 700; color: #1a3a6b; margin-top: 28px; }
        .comp-gen { text-align: center; font-size: 7.5px; color: #999; padding: 4px; background: #f8faff; border-top: 1px solid #e8edf5; }


        .dispatch-stamp { border: 2px solid #166534; color: #166534; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; padding: 3px 10px; display: inline-block; transform: rotate(-4deg); margin-top: 6px; }
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
        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>Chrome → Print → Save as PDF for best results</span>
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
              {s('company_gstin')      && <>GSTIN: <strong>{s('company_gstin')}</strong></>}
              {s('company_state_code') && <>&nbsp; | &nbsp;State Code: <strong>{s('company_state_code')}</strong></>}
              {s('company_phone')      && <>&nbsp; | &nbsp;Ph: {s('company_phone')}</>}
            </div>
          </div>
          <div className="hdr-right">
            <div className="doc-title">Dispatch Order</div>
            <div className="doc-number">{dispatchOrder.doNumber}</div>
            <div className="doc-barcode">
              <Barcode128
                value={dispatchOrder.doNumber}
                width={1.4}
                height={38}
                fontSize={9}
                background="#ffffff"
                lineColor="#000000"
              />
            </div>
            {isDispatched && (
              <div className="dispatch-stamp">Dispatched</div>
            )}
          </div>
        </div>

        {/* INFO BAR ROW 1 — DO#, Date, Status, Dispatched By */}
        <div className="info-bar">
          <div className="info-cell">
            <div className="info-label">DO Number</div>
            <div className="info-value">{dispatchOrder.doNumber}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">{dateLabel}</div>
            <div className="info-value">{docDate}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Status</div>
            <div className="info-value">
              <span
                className="status-badge"
                style={{ background: STATUS_COLOR[dispatchOrder.status] ?? '#6b7280' }}
              >
                {STATUS_LABEL[dispatchOrder.status] ?? dispatchOrder.status}
              </span>
            </div>
          </div>
          <div className="info-cell">
            <div className="info-label">{isDispatched ? 'Dispatched By' : 'Created By'}</div>
            <div className="info-value">
              {isDispatched && dispatchOrder.approvedBy
                ? dispatchOrder.approvedBy.name
                : dispatchOrder.createdBy.name}
            </div>
          </div>
        </div>

        {/* INFO BAR ROW 2 — Order#, Product, Dispatch Qty, Boxes */}
        <div className="info-bar info-bar-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="info-cell">
            <div className="info-label">Order Number</div>
            <div className="info-value">{order.orderNumber}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Product</div>
            <div className="info-value">{order.product.code} — {order.product.name}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Units in This DO</div>
            <div className="info-value">{totalUnits} of {order.quantity}</div>
          </div>
          <div className="info-cell">
            <div className="info-label">Total Boxes</div>
            <div className="info-value">{totalBoxes} box{totalBoxes !== 1 ? 'es' : ''}</div>
          </div>
        </div>


        {/* UNITS TABLE — only units that are in boxes for this DO */}
        <div className="section-title">
          Units Dispatched ({totalUnits} unit{totalUnits !== 1 ? 's' : ''})
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '5%' }} className="c">S.No</th>
              <th style={{ width: '25%' }}>Serial Number</th>
              <th style={{ width: '10%' }} className="c">Box #</th>
              <th style={{ width: '60%' }}>Barcode</th>
            </tr>
          </thead>
          <tbody>
            {doUnits.length === 0 ? (
              <tr>
                <td colSpan={4} className="c" style={{ padding: 16, color: '#888', fontStyle: 'italic' }}>
                  No units assigned to boxes yet.
                </td>
              </tr>
            ) : (
              doUnits.map((unit, i) => (
                <tr key={unit.serialNumber}>
                  <td className="c" style={{ color: '#888', fontSize: 8 }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 9.5, fontWeight: 700 }}>
                    {unit.serialNumber}
                  </td>
                  <td className="c" style={{ fontWeight: 700, color: '#1a3a6b' }}>
                    {unit.boxNumber}
                  </td>
                  <td>
                    {unit.finalAssemblyBarcode ? (
                      <Barcode128
                        value={unit.finalAssemblyBarcode}
                        width={1.1}
                        height={22}
                        fontSize={8}
                        displayValue={true}
                        background="#ffffff"
                        lineColor="#000000"
                      />
                    ) : (
                      <span style={{ color: '#aaa', fontSize: 8 }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* BOX SUMMARY TABLE */}
        {totalBoxes > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 8 }}>
              Box Summary ({totalBoxes} box{totalBoxes !== 1 ? 'es' : ''})
            </div>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '7%'  }} className="c">Box #</th>
                  <th style={{ width: '22%' }}>Box Label</th>
                  <th style={{ width: '20%' }}>Size</th>
                  <th style={{ width: '10%' }} className="c">Weight</th>
                  <th style={{ width: '7%'  }} className="c">Units</th>
                  <th style={{ width: '10%' }} className="c">Sealed</th>
                  <th style={{ width: '24%' }}>Serial Numbers</th>
                </tr>
              </thead>
              <tbody>
                {dispatchOrder.boxes.map((box) => (
                  <tr key={box.id}>
                    <td className="c" style={{ fontWeight: 700, fontSize: 10 }}>{box.boxNumber}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 8 }}>{box.boxLabel}</td>
                    <td style={{ fontSize: 8 }}>
                      {box.boxSize
                        ? `${box.boxSize.name} (${box.boxSize.lengthCm}×${box.boxSize.widthCm}×${box.boxSize.heightCm} cm)`
                        : <span style={{ color: '#aaa' }}>—</span>}
                    </td>
                    <td className="c" style={{ fontWeight: 600 }}>
                      {box.weightKg != null ? `${box.weightKg} kg` : <span style={{ color: '#aaa' }}>—</span>}
                    </td>
                    <td className="c">{box.items.length}</td>
                    <td className="c">
                      <span className="status-badge" style={{ background: box.isSealed ? '#166534' : '#92400e' }}>
                        {box.isSealed ? 'Sealed' : 'Open'}
                      </span>
                    </td>
                    <td style={{ fontSize: 7.5, color: '#444', lineHeight: 1.6 }}>
                      {box.items.map((item) => item.unit.serialNumber).join(', ')}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ background: '#f0f5ff', fontWeight: 700 }}>
                  <td colSpan={3} style={{ fontSize: 8, color: '#1a3a6b', padding: '4px 7px' }}>Total</td>
                  <td className="c" style={{ fontSize: 8.5 }}>
                    {dispatchOrder.boxes.reduce((s, b) => s + (b.weightKg ?? 0), 0).toFixed(2)} kg
                  </td>
                  <td className="c" style={{ fontSize: 8.5 }}>{totalUnits}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* FOOTER */}
        <div className="footer-row" style={{ marginTop: 'auto' }}>
          <div className="footer-col">
            <div className="f-label">Prepared By</div>
            <div style={{ fontSize: 9, color: '#333', marginBottom: 2 }}>{dispatchOrder.createdBy.name}</div>
            <div style={{ fontSize: 8, color: '#888' }}>Created: {fmtDate(dispatchOrder.createdAt)}</div>
            {isDispatched && dispatchOrder.approvedAt && (
              <div style={{ fontSize: 8, color: '#166534', marginTop: 2, fontWeight: 600 }}>
                Dispatched: {fmtDate(dispatchOrder.approvedAt)}
                {dispatchOrder.approvedBy ? ` by ${dispatchOrder.approvedBy.name}` : ''}
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 8, color: '#555' }}>
              This Dispatch Order is an internal document. Please retain for production records.
            </div>
          </div>
          <div className="footer-col">
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
              <div>
                <div className="f-label">For {coName}</div>
                <div style={{ fontSize: 8, color: '#888', marginBottom: 32 }}>Authorised Signatory</div>
              </div>
              <div className="sign-line">Authorised Signatory</div>
            </div>
          </div>
        </div>

        <div className="comp-gen">Computer Generated Dispatch Order — SMX Production System</div>

      </div>
    </>
  );
}
