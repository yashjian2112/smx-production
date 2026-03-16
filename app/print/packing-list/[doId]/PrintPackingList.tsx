'use client';

import { useEffect } from 'react';

type BoxSizeInfo = {
  name: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

type BoxItem = {
  id: string;
  unit: { serialNumber: string };
};

type Box = {
  id: string;
  boxNumber: number;
  boxLabel: string;
  isSealed: boolean;
  weightKg: number | null;
  boxSize: BoxSizeInfo | null;
  items: BoxItem[];
};

type DispatchOrderData = {
  id: string;
  doNumber: string;
  status: string;
  createdAt: string | Date;
  order: {
    orderNumber: string;
    quantity: number;
    client: { customerName: string; shippingAddress: string | null; state: string | null } | null;
    product: { code: string; name: string };
  };
  boxes: Box[];
  createdBy: { name: string };
};

type Settings = Record<string, string>;

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PrintPackingList({
  dispatchOrder,
  settings,
}: {
  dispatchOrder: DispatchOrderData;
  settings: Settings;
}) {
  const s = (k: string) => settings[k] ?? '';
  const coName = s('company_name') || 'SMX Drives';
  const order = dispatchOrder.order;
  const client = order.client;
  const boxes = dispatchOrder.boxes;
  const totalUnits = boxes.reduce((sum, b) => sum + b.items.length, 0);
  const totalWeight = boxes.reduce((sum, b) => sum + (b.weightKg ?? 0), 0);

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
        body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; background: #fff; }
        h1, h2, h3 { font-weight: 700; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #c8d8f0; padding: 5px 8px; text-align: left; }
        th { background: #1a3a6b; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
        tr:nth-child(even) td { background: #f0f5ff; }
      `}</style>

      {/* Screen controls */}
      <div className="no-print" style={{ padding: '10px 16px', background: '#18181b', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <button
          onClick={() => window.print()}
          style={{ background: '#1a3a6b', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}
        >
          Print Packing List
        </button>
        <button
          onClick={() => window.close()}
          style={{ background: '#3f3f46', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}
        >
          Close
        </button>
      </div>

      {/* Document */}
      <div style={{ maxWidth: 740, margin: '0 auto', padding: '0 4mm' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, borderBottom: '2px solid #1a3a6b', paddingBottom: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#1a3a6b', letterSpacing: 0.5 }}>{coName}</div>
            {s('company_address') && <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>{s('company_address')}</div>}
            {s('company_gstin') && <div style={{ fontSize: 9, color: '#555' }}>GSTIN: {s('company_gstin')}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a3a6b' }}>PACKING LIST</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>DO: <strong>{dispatchOrder.doNumber}</strong></div>
            <div style={{ fontSize: 10 }}>Order: <strong>#{order.orderNumber}</strong></div>
            <div style={{ fontSize: 9, color: '#555', marginTop: 2 }}>Date: {fmtDate(dispatchOrder.createdAt)}</div>
          </div>
        </div>

        {/* Customer + Product info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div style={{ border: '1px solid #c8d8f0', borderRadius: 4, padding: '8px 10px' }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#1a3a6b', marginBottom: 4 }}>Bill To / Ship To</div>
            {client ? (
              <>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{client.customerName}</div>
                {client.shippingAddress && <div style={{ fontSize: 9, color: '#444', marginTop: 2, lineHeight: 1.4 }}>{client.shippingAddress}</div>}
                {client.state && <div style={{ fontSize: 9, color: '#444' }}>{client.state}</div>}
              </>
            ) : (
              <div style={{ fontSize: 9, color: '#aaa' }}>—</div>
            )}
          </div>
          <div style={{ border: '1px solid #c8d8f0', borderRadius: 4, padding: '8px 10px' }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#1a3a6b', marginBottom: 4 }}>Product Details</div>
            <div style={{ fontSize: 11, fontWeight: 700 }}>{order.product.code}</div>
            <div style={{ fontSize: 9, color: '#444', marginTop: 1 }}>{order.product.name}</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 16 }}>
              <div>
                <div style={{ fontSize: 7, textTransform: 'uppercase', color: '#888', letterSpacing: 0.5 }}>Order Qty</div>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{order.quantity} units</div>
              </div>
              <div>
                <div style={{ fontSize: 7, textTransform: 'uppercase', color: '#888', letterSpacing: 0.5 }}>Dispatched</div>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{totalUnits} units</div>
              </div>
            </div>
          </div>
        </div>

        {/* Summary row */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          {[
            { label: 'Total Boxes', value: String(boxes.length) },
            { label: 'Total Units', value: String(totalUnits) },
            { label: 'Total Weight', value: totalWeight > 0 ? `${totalWeight.toFixed(1)} kg` : '—' },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{ flex: 1, textAlign: 'center', border: '1px solid #c8d8f0', borderRadius: 4, padding: '8px 4px', background: '#f0f5ff' }}
            >
              <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, color: '#1a3a6b', fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#1a3a6b', lineHeight: 1.3 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Box-by-box table */}
        <table style={{ marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>Box #</th>
              <th>Box Label</th>
              <th>Size</th>
              <th style={{ width: 60 }}>Weight</th>
              <th style={{ width: 50 }}>Units</th>
              <th>Serial Numbers</th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((box) => (
              <tr key={box.id}>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{box.boxNumber}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 9 }}>{box.boxLabel}</td>
                <td style={{ fontSize: 9 }}>
                  {box.boxSize
                    ? `${box.boxSize.name} (${box.boxSize.lengthCm}×${box.boxSize.widthCm}×${box.boxSize.heightCm} cm)`
                    : '—'}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {box.weightKg ? `${box.weightKg} kg` : '—'}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{box.items.length}</td>
                <td style={{ fontSize: 8, fontFamily: 'monospace', lineHeight: 1.6 }}>
                  {box.items.map((item) => item.unit.serialNumber).join(', ') || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Signature section */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 20 }}>
          {['Packed By', 'Checked By', 'Authorized By'].map((label) => (
            <div key={label} style={{ borderTop: '1px solid #aaa', paddingTop: 6 }}>
              <div style={{ fontSize: 8, color: '#888' }}>{label}</div>
              <div style={{ marginTop: 20, borderTop: '1px dashed #ccc', paddingTop: 3, fontSize: 8, color: '#aaa' }}>Signature &amp; Date</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, fontSize: 8, color: '#888', textAlign: 'center', borderTop: '1px solid #e5e7eb', paddingTop: 6 }}>
          Generated on {fmtDate(new Date())} · {dispatchOrder.doNumber} · {coName}
        </div>
      </div>
    </>
  );
}
