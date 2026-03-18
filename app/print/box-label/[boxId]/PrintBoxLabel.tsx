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
  id: string;
  doNumber: string;
  totalBoxes: number | null;
  createdAt: string | Date;
  order: {
    orderNumber: string;
    product: { code: string; name: string };
    client?: { customerName: string } | null;
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
  const coName  = s('company_name') || 'SMX Drives';
  const coAddr  = s('company_address') || '';
  const coPhone = s('company_phone') || '';
  const order   = box.dispatchOrder.order;
  const totalBoxes = box.dispatchOrder.totalBoxes ?? '?';
  const doId = box.dispatchOrder.id;

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 12mm 14mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; background: #fff; }

        .label-wrap {
          border: 2.5px solid #1a3a6b;
          width: 100%;
          min-height: 250mm;
          display: flex;
          flex-direction: column;
          border-radius: 4px;
          overflow: hidden;
        }

        /* ── Header ─────────────────────────────────────────────────────── */
        .lbl-hdr {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #1a3a6b;
          color: #fff;
          padding: 10px 14px;
        }
        .lbl-co-name  { font-size: 16px; font-weight: 800; letter-spacing: 0.5px; }
        .lbl-co-sub   { font-size: 9px; opacity: 0.75; margin-top: 2px; }
        .lbl-hdr-right { text-align: right; }
        .lbl-do-num   { font-size: 12px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px; }
        .lbl-do-date  { font-size: 9px; opacity: 0.75; margin-top: 2px; }

        /* ── Box number banner ───────────────────────────────────────────── */
        .lbl-box-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 16px;
          background: #f0f5ff;
          border-bottom: 2px solid #1a3a6b;
        }
        .box-num-big  { font-size: 44px; font-weight: 900; color: #1a3a6b; line-height: 1; letter-spacing: -1px; }
        .box-of-txt   { font-size: 18px; font-weight: 600; color: #444; margin-left: 6px; }
        .lbl-status-col { text-align: right; }
        .lbl-box-label-txt { font-family: monospace; font-size: 11px; color: #555; margin-bottom: 4px; }
        .lbl-sealed-badge {
          display: inline-block;
          font-size: 11px; font-weight: 800;
          padding: 3px 14px; border-radius: 14px;
          color: #fff;
          background: ${box.isSealed ? '#166534' : '#92400e'};
          letter-spacing: 0.5px;
        }

        /* ── Barcode ─────────────────────────────────────────────────────── */
        .lbl-barcode {
          text-align: center;
          padding: 8px 16px 6px;
          border-bottom: 1px solid #c8d8f0;
          background: #fff;
        }
        .lbl-barcode-value {
          font-family: monospace; font-size: 11px; color: #333; margin-top: 2px; letter-spacing: 1px;
        }

        /* ── Info grid — 2×3 cells ───────────────────────────────────────── */
        .lbl-info {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-bottom: 1px solid #c8d8f0;
        }
        .lbl-info-cell { padding: 8px 14px; }
        .lbl-info-cell:nth-child(odd) { border-right: 1px solid #c8d8f0; }
        .lbl-info-cell:nth-child(3),
        .lbl-info-cell:nth-child(4) { border-top: 1px solid #c8d8f0; }
        .lbl-info-cell:nth-child(5),
        .lbl-info-cell:nth-child(6) { border-top: 1px solid #c8d8f0; }
        .lbl-info-label {
          font-size: 8px; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.8px; color: #1a3a6b; margin-bottom: 3px;
        }
        .lbl-info-value { font-size: 12px; font-weight: 600; color: #111; line-height: 1.4; }
        .lbl-info-value-sm { font-size: 11px; font-weight: 600; color: #111; line-height: 1.4; }

        /* ── Physical specs bar ──────────────────────────────────────────── */
        .lbl-specs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #c8d8f0;
          background: #f8faff;
        }
        .lbl-spec-item {
          flex: 1;
          padding: 8px 14px;
          border-right: 1px solid #c8d8f0;
        }
        .lbl-spec-item:last-child { border-right: none; }
        .lbl-spec-label { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: #1a3a6b; margin-bottom: 3px; }
        .lbl-spec-value { font-size: 13px; font-weight: 700; color: #111; }

        /* ── Serial numbers ──────────────────────────────────────────────── */
        .lbl-serials { padding: 10px 14px; flex: 1; }
        .lbl-ser-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px;
        }
        .lbl-ser-title {
          font-size: 9px; font-weight: 800; text-transform: uppercase;
          letter-spacing: 0.8px; color: #1a3a6b;
        }
        .lbl-ser-count {
          font-size: 9px; font-weight: 700; color: #555;
          background: #e8eeff; padding: 1px 8px; border-radius: 8px;
          border: 1px solid #c8d8f0;
        }
        .ser-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
          gap: 5px;
        }
        .ser-item {
          font-family: monospace; font-size: 10px; color: #111;
          background: #f0f5ff; border: 1px solid #c8d8f0;
          border-radius: 4px; padding: 3px 8px;
          text-align: center;
        }

        /* ── Footer ─────────────────────────────────────────────────────── */
        .lbl-footer {
          display: flex; justify-content: space-between; align-items: center;
          padding: 6px 14px;
          background: #1a3a6b;
          color: rgba(255,255,255,0.75);
        }
        .lbl-footer-text { font-size: 9px; }
        .lbl-footer-center { font-size: 10px; font-weight: 700; color: #fff; }
      `}</style>

      {/* Print controls — screen only */}
      <div className="no-print" style={{ padding: '12px 16px', background: '#18181b', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <button
          onClick={() => window.history.length > 1 ? window.history.back() : window.location.href = `/shipping/do/${doId}`}
          style={{ background: '#3f3f46', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
        >
          ← Back
        </button>
        <button
          onClick={() => window.print()}
          style={{ background: '#1a3a6b', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
        >
          Print Label
        </button>
        <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>A4 print</span>
      </div>

      <div className="label-wrap">

        {/* Header */}
        <div className="lbl-hdr">
          <div>
            <div className="lbl-co-name">{coName}</div>
            {(coAddr || coPhone) && (
              <div className="lbl-co-sub">{[coAddr, coPhone].filter(Boolean).join(' · ')}</div>
            )}
          </div>
          <div className="lbl-hdr-right">
            <div className="lbl-do-num">DO: {box.dispatchOrder.doNumber}</div>
            <div className="lbl-do-date">{fmtDate(box.createdAt)}</div>
          </div>
        </div>

        {/* Box number banner */}
        <div className="lbl-box-banner">
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span className="box-num-big">BOX {box.boxNumber}</span>
            <span className="box-of-txt">/ {totalBoxes}</span>
          </div>
          <div className="lbl-status-col">
            <div className="lbl-box-label-txt">{box.boxLabel}</div>
            <span className="lbl-sealed-badge">{box.isSealed ? '✓ SEALED' : 'OPEN'}</span>
          </div>
        </div>

        {/* Barcode */}
        <div className="lbl-barcode">
          <Barcode128
            value={box.boxLabel}
            width={2.2}
            height={52}
            fontSize={11}
            displayValue={false}
            background="#ffffff"
            lineColor="#000000"
          />
          <div className="lbl-barcode-value">{box.boxLabel}</div>
        </div>

        {/* Info grid: Order, Client, Product, DO */}
        <div className="lbl-info">
          <div className="lbl-info-cell">
            <div className="lbl-info-label">Order Number</div>
            <div className="lbl-info-value">{order.orderNumber}</div>
          </div>
          <div className="lbl-info-cell">
            <div className="lbl-info-label">Customer</div>
            <div className="lbl-info-value-sm">{order.client?.customerName ?? '—'}</div>
          </div>
          <div className="lbl-info-cell">
            <div className="lbl-info-label">Product Code</div>
            <div className="lbl-info-value">{order.product.code}</div>
          </div>
          <div className="lbl-info-cell">
            <div className="lbl-info-label">Product Name</div>
            <div className="lbl-info-value-sm">{order.product.name}</div>
          </div>
        </div>

        {/* Physical specs: weight + dimensions + units */}
        <div className="lbl-specs">
          <div className="lbl-spec-item">
            <div className="lbl-spec-label">Weight</div>
            <div className="lbl-spec-value">{box.weightKg ? `${box.weightKg} kg` : '—'}</div>
          </div>
          <div className="lbl-spec-item">
            <div className="lbl-spec-label">Box Size</div>
            <div className="lbl-spec-value">{box.boxSize ? box.boxSize.name : '—'}</div>
          </div>
          <div className="lbl-spec-item">
            <div className="lbl-spec-label">Dimensions (L×W×H)</div>
            <div className="lbl-spec-value">{box.boxSize ? `${box.boxSize.lengthCm} × ${box.boxSize.widthCm} × ${box.boxSize.heightCm} cm` : '—'}</div>
          </div>
          <div className="lbl-spec-item">
            <div className="lbl-spec-label">Units in Box</div>
            <div className="lbl-spec-value">{box.items.length}</div>
          </div>
        </div>

        {/* Serial numbers */}
        <div className="lbl-serials">
          <div className="lbl-ser-header">
            <span className="lbl-ser-title">Contents — Unit Serial Numbers</span>
            <span className="lbl-ser-count">{box.items.length} unit{box.items.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="ser-grid">
            {box.items.map((item) => (
              <span key={item.id} className="ser-item">{item.unit.serialNumber}</span>
            ))}
            {box.items.length === 0 && (
              <span style={{ fontSize: 10, color: '#aaa', fontStyle: 'italic' }}>No items packed</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="lbl-footer">
          <span className="lbl-footer-text">DO: {box.dispatchOrder.doNumber}</span>
          <span className="lbl-footer-center">Box {box.boxNumber} of {totalBoxes}</span>
          <span className="lbl-footer-text">{fmtDate(box.createdAt)}</span>
        </div>

      </div>
    </>
  );
}
