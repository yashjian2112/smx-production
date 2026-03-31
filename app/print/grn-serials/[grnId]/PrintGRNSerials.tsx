'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

type Serial = {
  id: string;
  barcode: string;
  quantity: number;
  stageType: string;
  status: string;
  material: { id: string; name: string; code: string };
};

type GRN = {
  id: string;
  grnNumber: string;
  receivedAt: string;
  materialSerials: Serial[];
  purchaseOrder: {
    poNumber: string;
    vendor: { name: string };
  };
};

function LabelBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: 'CODE128',
      width: 1.4,
      height: 38,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
  }, [value]);
  return <svg ref={ref} style={{ display: 'block', width: '100%' }} />;
}

export default function PrintGRNSerials({ grn }: { grn: GRN }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #fff; }

        @media print {
          @page {
            size: 50mm 25mm;
            margin: 0;
          }
          body { margin: 0; }
          .no-print { display: none !important; }
        }

        .label {
          width: 50mm;
          height: 25mm;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1mm 2mm 1.5mm;
          page-break-after: always;
          background: #fff;
        }
        .label:last-child {
          page-break-after: auto;
        }

        .label-barcode {
          width: 100%;
          flex-shrink: 0;
        }

        .label-code {
          font-family: 'Courier New', monospace;
          font-size: 7.5pt;
          font-weight: bold;
          letter-spacing: 0.3px;
          margin-top: 1mm;
          text-align: center;
        }

        .label-sub {
          font-family: Arial, sans-serif;
          font-size: 6pt;
          color: #444;
          margin-top: 0.5mm;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 46mm;
        }

        @media screen {
          body { background: #eee; padding: 12px; }
          .label {
            border: 1px dashed #999;
            margin: 6px auto;
            box-shadow: 0 1px 4px rgba(0,0,0,0.15);
          }
          .no-print {
            font-family: Arial, sans-serif;
            font-size: 13px;
            color: #333;
            margin-bottom: 14px;
            padding: 8px 14px;
            background: #fff;
            border: 1px solid #ccc;
            border-radius: 6px;
            display: inline-block;
          }
        }
      `}</style>

      <div className="no-print">
        <strong>GRN: {grn.grnNumber}</strong> &nbsp;·&nbsp;
        {grn.materialSerials.length} labels &nbsp;·&nbsp;
        50mm × 25mm &nbsp;·&nbsp; TVS LP46 Neo
      </div>

      {grn.materialSerials.map(s => (
        <div key={s.id} className="label">
          <div className="label-barcode">
            <LabelBarcode value={s.barcode} />
          </div>
          <div className="label-code">{s.barcode}</div>
          <div className="label-sub">
            {s.material.name}{s.quantity > 1 ? ` · Qty: ${s.quantity}` : ''} · {grn.grnNumber}
          </div>
        </div>
      ))}
    </>
  );
}
