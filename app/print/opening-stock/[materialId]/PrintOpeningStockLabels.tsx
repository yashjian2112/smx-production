'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface Props {
  material: { id: string; name: string; code: string; unit: string; packSize: number };
  serials: { id: string; barcode: string; quantity: number; status: string }[];
}

function LabelBarcode({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: 'CODE128',
      width: 1.3,
      height: 26,
      displayValue: false,
      margin: 0,
      background: '#ffffff',
      lineColor: '#000000',
    });
  }, [value]);
  return <svg ref={ref} style={{ display: 'block', width: '100%' }} />;
}

export default function PrintOpeningStockLabels({ material, serials }: Props) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 800);
    return () => clearTimeout(t);
  }, []);

  const packLabel = material.packSize > 1 ? ` (Pack of ${material.packSize})` : '';

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

        .label-name {
          font-family: Arial, sans-serif;
          font-size: 8pt;
          font-weight: bold;
          text-align: center;
          color: #000;
          max-width: 46mm;
          line-height: 1.2;
          margin-bottom: 0.5mm;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .label-barcode {
          width: 100%;
          flex-shrink: 0;
        }

        .label-code {
          font-family: 'Courier New', monospace;
          font-size: 9pt;
          font-weight: bold;
          letter-spacing: 0.5px;
          margin-top: 0.8mm;
          text-align: center;
          color: #000;
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
        <strong>Opening Stock: {material.name}</strong> &nbsp;·&nbsp;
        {serials.length} labels &nbsp;·&nbsp;
        50mm x 25mm &nbsp;·&nbsp; TVS LP46 Neo
      </div>

      {serials.map(s => (
        <div key={s.id} className="label">
          <div className="label-name">{material.name}{packLabel}</div>
          <div className="label-barcode">
            <LabelBarcode value={s.barcode} />
          </div>
          <div className="label-code">{s.barcode}</div>
        </div>
      ))}
    </>
  );
}
