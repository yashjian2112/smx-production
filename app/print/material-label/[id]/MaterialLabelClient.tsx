'use client';
import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface Props {
  material: { id: string; code: string; name: string; unit: string; barcode: string; category: string | null };
}

export default function MaterialLabelClient({ material }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      JsBarcode(svgRef.current, material.barcode, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 12,
        margin: 8,
        background: '#ffffff',
        lineColor: '#000000',
      });
    }
    setTimeout(() => window.print(), 600);
  }, [material.barcode]);

  return (
    <html>
      <head>
        <title>Label – {material.code}</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; background: white; }
          @page { size: 62mm 40mm; margin: 0; }
          .label {
            width: 62mm; height: 40mm;
            border: 1px solid #ccc;
            padding: 3mm;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 2mm;
          }
          .name { font-size: 9pt; font-weight: bold; text-align: center; max-width: 56mm; }
          .meta { font-size: 7pt; color: #555; text-align: center; }
          svg { max-width: 56mm; }
          @media print { body { print-color-adjust: exact; } }
        `}</style>
      </head>
      <body>
        <div className="label">
          <p className="name">{material.name}</p>
          <svg ref={svgRef} />
          <p className="meta">{material.code} · {material.unit}{material.category ? ` · ${material.category}` : ''}</p>
        </div>
      </body>
    </html>
  );
}
