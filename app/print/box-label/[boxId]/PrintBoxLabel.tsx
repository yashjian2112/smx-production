'use client';

import { useEffect } from 'react';
import { Barcode128 } from '@/components/Barcode128';

type BoxItem = {
  id: string;
  serial: string;
  barcode: string;
  unit: { serialNumber: string };
};

type DispatchOrder = {
  doNumber: string;
  totalBoxes: number | null;
  createdAt: string | Date;
  order: {
    orderNumber: string;
    client: {
      customerName: string;
      state: string | null;
      shippingAddress: string | null;
      phone: string | null;
    } | null;
    product: { code: string; name: string };
  };
};

type BoxSizeInfo = {
  name: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

type Box = {
  id: string;
  boxNumber: number;
  boxLabel: string;
  isSealed: boolean;
  weightKg: number | null;
  boxSize: BoxSizeInfo | null;
  createdAt: string | Date;
  dispatchOrder: DispatchOrder;
  items: BoxItem[];
};

type Settings = Record<string, string>;

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PrintBoxLabel({ box, settings }: { box: Box; settings: Settings }) {
  const s = (k: string) => settings[k] ?? '';
  const coName = s('company_name') || 'Three Shul Motors Pvt Ltd';
  const order = box.dispatchOrder.order;
  const client = order.client;
  const totalBoxes = box.dispatchOrder.totalBoxes ?? '?';

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        @page { size: A6 landscape; margin: 5mm 6mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #111; background: #fff; }

        .label-wrap {
          border: 2px solid #1a3a6b;
          width: 138mm;
          min-height: 96mm;
          display: flex;
          flex-direction: column;
          page-break-after: avoid;
        }

        .lbl-hdr {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #1a3a6b;
          color: #fff;
          padding: 5px 8px;
        }
        .lbl-co { font-size: 9px; font-weight: 700; letter-spacing: 0.3px; }
        .lbl-do { font-size: 8px; opacity: 0.85; }

        .lbl-box-number {
          text-align: center;
          padding: 6px 8px 2px;
          border-bottom: 1px solid #c8d8f0;
        }
        .box-num-big { font-size: 22px; font-weight: 900; color: #1a3a6b; letter-spacing: 1px; line-height: 1; }
        .box-num-sub { font-size: 9px; color: #555; margin-top: 2px; }

        .lbl-barcode { text-align: center; padding: 4px 8px; border-bottom: 1px solid #c8d8f0; }
        .lbl-barcode-label { font-family: monospace; font-size: 8px; color: #444; margin-top: 1px; }

        .lbl-info { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid #c8d8f0; }
        .lbl-info-cell { padding: 4px 8px; }
        .lbl-info-cell:first-child { border-right: 1px solid #c8d8f0; }
        .lbl-info-label { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #1a3a6b; margin-bottom: 1px; }
        .lbl-info-value { font-size: 9px; font-weight: 600; color: #111; line-height: 1.4; }

        .lbl-serials { padding: 4px 8px; border-bottom: 1px solid #c8d8f0; flex: 1; }
        .lbl-ser-title { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #1a3a6b; margin-bottom: 3px; }
        .ser-list { display: flex; flex-wrap: wrap; gap: 3px 10px; }
        .ser-item { font-family: monospace; font-size: 8px; color: #111; background: #f0f5ff; border: 1px solid #c8d8f0; border-radius: 3px; padding: 1px 5px; }

        .lbl-footer { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: #f8faff; }
        .lbl-footer-text { font-size: 7.5px; color: #666; }
        .sealed-badge { font-size: 8px; font-weight: 700; padding: 2px 8px; border-radius: 10px; color: #fff; background: ${box.isSealed ? '#166534' : '#92400e'}; }
      `}</style>

      {/* Print controls */}
      <div className="no-print" style={{ padding: '10px 16px', background: '#18181b', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <button
          onClick={() => window.print()}
          style={{ background: '#1a3a6b', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
        >
          Print Label
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: '#3f3f46', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
        >
          Close
        </button>
        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>Print on A6 / cut to label size</span>
      </div>

      <div className="label-wrap">

        {/* Header */}
        <div className="lbl-hdr">
          <div className="lbl-co">{coName}</div>
          <div className="lbl-do">DO: {box.dispatchOrder.doNumber}</div>
        </div>

        {/* Box number */}
        <div className="lbl-box-number">
          <div className="box-num-big">BOX {box.boxNumber} <span style={{ fontSize: 14, fontWeight: 600, color: '#555' }}>of {totalBoxes}</span></div>
          <div className="box-num-sub">{box.boxLabel}</div>
        </div>

        {/* Barcode of box label */}
        <div className="lbl-barcode">
          <Barcode128
            value={box.boxLabel}
            width={1.5}
            height={36}
            fontSize={9}
            displayValue={false}
            background="#ffffff"
            lineColor="#000000"
          />
          <div className="lbl-barcode-label">{box.boxLabel}</div>
        </div>

        {/* Info grid */}
        <div className="lbl-info">
          <div className="lbl-info-cell">
            <div className="lbl-info-label">Customer</div>
            <div className="lbl-info-value">{client?.customerName ?? '—'}</div>
          </div>
          <div className="lbl-info-cell">
            <div className="lbl-info-label">Product</div>
            <div className="lbl-info-value">{order.product.code}</div>
          </div>
          <div className="lbl-info-cell" style={{ borderTop: '1px solid #c8d8f0' }}>
            <div className="lbl-info-label">Destination</div>
            <div className="lbl-info-value">{client?.state ?? '—'}</div>
          </div>
          <div className="lbl-info-cell" style={{ borderTop: '1px solid #c8d8f0' }}>
            <div className="lbl-info-label">Date</div>
            <div className="lbl-info-value">{fmtDate(box.createdAt)}</div>
          </div>
          {box.weightKg && (
            <div className="lbl-info-cell" style={{ borderTop: '1px solid #c8d8f0' }}>
              <div className="lbl-info-label">Weight</div>
              <div className="lbl-info-value">{box.weightKg} kg</div>
            </div>
          )}
          {box.boxSize && (
            <div className="lbl-info-cell" style={{ borderTop: '1px solid #c8d8f0' }}>
              <div className="lbl-info-label">Box Size</div>
              <div className="lbl-info-value">{box.boxSize.name} · {box.boxSize.lengthCm}×{box.boxSize.widthCm}×{box.boxSize.heightCm} cm</div>
            </div>
          )}
        </div>

        {/* Serial numbers */}
        <div className="lbl-serials">
          <div className="lbl-ser-title">Contents — {box.items.length} unit{box.items.length !== 1 ? 's' : ''}</div>
          <div className="ser-list">
            {box.items.map((item) => (
              <span key={item.id} className="ser-item">{item.unit.serialNumber}</span>
            ))}
            {box.items.length === 0 && <span style={{ fontSize: 8, color: '#aaa', fontStyle: 'italic' }}>No items scanned yet</span>}
          </div>
        </div>

        {/* Footer */}
        <div className="lbl-footer">
          <span className="lbl-footer-text">Order: {order.orderNumber}</span>
          <span className="sealed-badge">{box.isSealed ? 'SEALED' : 'OPEN'}</span>
          <span className="lbl-footer-text">{fmtDate(box.createdAt)}</span>
        </div>

      </div>
    </>
  );
}
