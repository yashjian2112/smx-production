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
        width: 1.4,
        height: 28,
        displayValue: true,
        fontSize: 8,
        margin: 4,
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
          @page { size: 50mm 25mm; margin: 0; }
          .label {
            width: 50mm; height: 25mm;
            padding: 1.5mm 2mm;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 1mm;
            overflow: hidden;
          }
          .name { font-size: 6.5pt; font-weight: bold; text-align: center; max-width: 46mm; line-height: 1.2; }
          .meta { font-size: 5.5pt; color: #333; text-align: center; }
          svg { max-width: 46mm; }
          @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
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
