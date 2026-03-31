'use client';

import { useEffect } from 'react';

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

export default function PrintGRNSerials({ grn }: { grn: GRN }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&display=swap"
        rel="stylesheet"
      />
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #fff; }

        @media print {
          @page {
            size: 50mm 25mm;
            margin: 0;
          }
          body { margin: 0; }
          .no-print { display: none; }
        }

        /* One label per page */
        .label {
          width: 50mm;
          height: 25mm;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1mm 1.5mm;
          page-break-after: always;
        }
        .label:last-child {
          page-break-after: auto;
        }

        .barcode {
          font-family: 'Libre Barcode 128', monospace;
          font-size: 30px;
          line-height: 1;
          letter-spacing: 0;
          white-space: nowrap;
          max-width: 100%;
        }

        .barcode-num {
          font-family: monospace;
          font-size: 7pt;
          font-weight: bold;
          letter-spacing: 0.5px;
          margin-top: 0.5mm;
        }

        .label-sub {
          font-family: Arial, sans-serif;
          font-size: 6pt;
          color: #333;
          margin-top: 0.3mm;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 48mm;
        }

        /* Screen preview */
        @media screen {
          body { background: #f5f5f5; padding: 16px; }
          .label {
            border: 1px dashed #999;
            margin: 4px auto;
            background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .no-print {
            font-family: Arial, sans-serif;
            font-size: 13px;
            color: #333;
            margin-bottom: 12px;
            padding: 8px 12px;
            background: #fff;
            border: 1px solid #ddd;
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
          <div className="barcode">{s.barcode}</div>
          <div className="barcode-num">{s.barcode}</div>
          <div className="label-sub">
            {s.material.name}{s.quantity > 1 ? ` · Qty: ${s.quantity}` : ''} · {grn.grnNumber}
          </div>
        </div>
      ))}
    </>
  );
}
