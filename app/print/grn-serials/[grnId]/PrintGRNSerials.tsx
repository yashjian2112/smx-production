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

  const byMaterial = grn.materialSerials.reduce<Record<string, { material: Serial['material']; stageType: string; serials: Serial[] }>>(
    (acc, s) => {
      if (!acc[s.material.id]) acc[s.material.id] = { material: s.material, stageType: s.stageType, serials: [] };
      acc[s.material.id].serials.push(s);
      return acc;
    },
    {}
  );

  return (
    <div style={{ fontFamily: 'monospace', padding: '16px', background: '#fff', color: '#000' }}>
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          body { margin: 0; }
        }
        .label {
          display: inline-block;
          border: 1px solid #000;
          padding: 6px 10px;
          margin: 4px;
          width: 180px;
          text-align: center;
          vertical-align: top;
          page-break-inside: avoid;
        }
        .barcode-text {
          font-family: 'Libre Barcode 128', monospace;
          font-size: 36px;
          line-height: 1;
          letter-spacing: 2px;
        }
        .label-code {
          font-size: 11px;
          font-weight: bold;
          margin-top: 2px;
        }
        .label-info {
          font-size: 9px;
          color: #555;
          margin-top: 1px;
        }
        .section-header {
          font-weight: bold;
          font-size: 13px;
          margin: 12px 0 6px;
          border-bottom: 1px solid #ccc;
          padding-bottom: 4px;
        }
        .print-header {
          margin-bottom: 12px;
          font-size: 12px;
        }
      `}</style>

      <link
        href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&display=swap"
        rel="stylesheet"
      />

      <div className="print-header">
        <strong>GRN Barcode Labels</strong> — {grn.grnNumber}<br />
        PO: {grn.purchaseOrder.poNumber} | Vendor: {grn.purchaseOrder.vendor.name}<br />
        Total labels: {grn.materialSerials.length}
      </div>

      {Object.values(byMaterial).map(({ material, stageType, serials }) => (
        <div key={material.id}>
          <div className="section-header">
            {material.name} ({material.code}) — {stageType} Stage — {serials.length} units
          </div>
          <div>
            {serials.map(s => (
              <div key={s.id} className="label">
                <div className="barcode-text">{s.barcode}</div>
                <div className="label-code">{s.barcode}</div>
                {s.quantity > 1 && <div className="label-info" style={{ fontWeight: 'bold', fontSize: '11px' }}>Qty: {s.quantity} {material.code}</div>}
                <div className="label-info">{stageType} · {grn.grnNumber}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
