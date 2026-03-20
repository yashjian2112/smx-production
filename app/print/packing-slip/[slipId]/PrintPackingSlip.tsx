'use client';

import { useEffect } from 'react';
import { Barcode128 } from '@/components/Barcode128';

type BoxSizeInfo = { name: string; lengthCm: number; widthCm: number; heightCm: number };
type BoxItem     = { id: string; unit: { serialNumber: string } };
type Box = {
  id: string;
  boxNumber: number;
  boxLabel: string;
  weightKg: number | null;
  boxSize: BoxSizeInfo | null;
  items: BoxItem[];
};

type PackingSlipData = {
  id: string;
  slipNumber: string;
  status: string;
  generatedAt: string | Date;
  generatedBy: { name: string };
  packingList: { id: string; listNumber: string } | null;
  dispatchOrder: {
    id: string;
    doNumber: string;
    status: string;
    dispatchQty: number;
    order: {
      orderNumber: string;
      product: { code: string; name: string };
      client: { customerName: string } | null;
    };
    createdBy: { name: string };
    boxes: Box[];
  };
};

type Settings = Record<string, string>;

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(d: string | Date) {
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function PrintPackingSlip({
  packingSlip,
  settings,
  isPartial,
}: {
  packingSlip: PackingSlipData;
  settings: Settings;
  isPartial: boolean;
}) {
  const do_   = packingSlip.dispatchOrder;
  const order = do_.order;
  const boxes = do_.boxes;
  const totalUnits  = boxes.reduce((s, b) => s + b.items.length, 0);
  const totalWeight = boxes.reduce((s, b) => s + (b.weightKg ?? 0), 0);

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 10mm 12mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; background: #fff; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #c8d8f0; padding: 5px 8px; text-align: left; vertical-align: top; }
        th { background: #1a3a6b; color: #fff; font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; }
        tr:nth-child(even) td { background: #f5f8ff; }
      `}</style>

      {/* Screen controls */}
      <div className="no-print" style={{ padding: '10px 16px', background: '#18181b', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
        <button onClick={() => window.print()}
          style={{ background: '#1a3a6b', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          Print Packing Slip
        </button>
        <button onClick={() => window.close()}
          style={{ background: '#3f3f46', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
          Close
        </button>
      </div>

      <div style={{ maxWidth: 740, margin: '0 auto', padding: '0 2mm' }}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #1a3a6b', paddingBottom: 8, marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#1a3a6b', letterSpacing: 0.5 }}>Three Shul Motors Pvt Ltd</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#1a3a6b', marginTop: 2, letterSpacing: 0.5 }}>PACKING SLIP</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Slip Number</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#1a3a6b', fontFamily: 'monospace' }}>{packingSlip.slipNumber}</div>
            <div style={{ marginTop: 4 }}>
              <Barcode128
                value={packingSlip.slipNumber}
                width={1.4}
                height={32}
                fontSize={8}
                displayValue={false}
                background="#ffffff"
                lineColor="#000000"
              />
            </div>
            <div style={{ fontSize: 7, color: '#666', marginTop: 1, fontFamily: 'monospace' }}>{packingSlip.slipNumber}</div>
            <div style={{ fontSize: 8, color: '#888', marginTop: 3 }}>Scan to generate Packing List</div>
          </div>
        </div>

        {/* ── Info Grid ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>

          {/* DO + Order details */}
          <div style={{ border: '1px solid #c8d8f0', borderRadius: 4, padding: '8px 10px' }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#1a3a6b', marginBottom: 5 }}>Dispatch Details</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Dispatch Order', do_.doNumber],
                  ['Work Order',     order.orderNumber],
                  ['DO Type',        isPartial
                    ? <span style={{ color: '#b45309', fontWeight: 700 }}>PARTIAL DISPATCH</span>
                    : <span style={{ color: '#166534', fontWeight: 700 }}>COMPLETE DISPATCH</span>],
                  ['Date',          fmtDate(packingSlip.generatedAt)],
                  ['Time',          fmtTime(packingSlip.generatedAt)],
                ].map(([label, value]) => (
                  <tr key={String(label)} style={{ background: 'none' }}>
                    <td style={{ border: 'none', padding: '2px 0', fontSize: 8, color: '#555', width: 90 }}>{label}</td>
                    <td style={{ border: 'none', padding: '2px 0', fontSize: 9, fontWeight: 600 }}>{value as React.ReactNode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Product + Packing user */}
          <div style={{ border: '1px solid #c8d8f0', borderRadius: 4, padding: '8px 10px' }}>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#1a3a6b', marginBottom: 5 }}>Product &amp; Packing Details</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Product Code',   order.product.code],
                  ['Product Name',   order.product.name],
                  ['Total Units',    String(totalUnits)],
                  ['Total Boxes',    String(boxes.length)],
                  ['Total Weight',   totalWeight > 0 ? `${totalWeight.toFixed(2)} kg` : '—'],
                  ['Packed By',      packingSlip.generatedBy.name],
                ].map(([label, value]) => (
                  <tr key={label} style={{ background: 'none' }}>
                    <td style={{ border: 'none', padding: '2px 0', fontSize: 8, color: '#555', width: 90 }}>{label}</td>
                    <td style={{ border: 'none', padding: '2px 0', fontSize: 9, fontWeight: 600 }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Summary Strip ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {[
            { label: 'Total Boxes',  value: String(boxes.length) },
            { label: 'Total Units',  value: String(totalUnits)   },
            { label: 'Total Weight', value: totalWeight > 0 ? `${totalWeight.toFixed(2)} kg` : '—' },
          ].map(({ label, value }) => (
            <div key={label} style={{ flex: 1, textAlign: 'center', border: '1px solid #c8d8f0', borderRadius: 4, padding: '8px 4px', background: '#f0f5ff' }}>
              <div style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, color: '#1a3a6b', fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#1a3a6b', lineHeight: 1.3 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* ── Box Contents Table ────────────────────────────────────────────── */}
        <table style={{ marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={{ width: 38 }}>Box #</th>
              <th>Box Label</th>
              <th>Dimensions (L×W×H cm)</th>
              <th style={{ width: 65 }}>Weight</th>
              <th style={{ width: 40 }}>Units</th>
              <th>Serial Numbers (Product Details)</th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((box) => (
              <tr key={box.id}>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{box.boxNumber}</td>
                <td style={{ fontFamily: 'monospace', fontSize: 8 }}>{box.boxLabel}</td>
                <td style={{ fontSize: 9 }}>
                  {box.boxSize
                    ? `${box.boxSize.name} · ${box.boxSize.lengthCm}×${box.boxSize.widthCm}×${box.boxSize.heightCm}`
                    : '—'}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {box.weightKg ? `${box.weightKg} kg` : '—'}
                </td>
                <td style={{ textAlign: 'center', fontWeight: 700 }}>{box.items.length}</td>
                <td style={{ fontSize: 8, fontFamily: 'monospace', lineHeight: 1.7 }}>
                  {box.items.length > 0
                    ? box.items.map((item) => item.unit.serialNumber).join(', ')
                    : <span style={{ color: '#aaa' }}>—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Signatures ────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginTop: 20 }}>
          {['Packed By', 'QC Inspector', 'Authorized By'].map((label) => (
            <div key={label} style={{ borderTop: '1px solid #aaa', paddingTop: 6 }}>
              <div style={{ fontSize: 8, color: '#888' }}>{label}</div>
              {label === 'Packed By' && (
                <div style={{ fontSize: 9, fontWeight: 600, marginTop: 2 }}>{packingSlip.generatedBy.name}</div>
              )}
              <div style={{ marginTop: 18, borderTop: '1px dashed #ccc', paddingTop: 3, fontSize: 8, color: '#aaa' }}>Signature &amp; Date</div>
            </div>
          ))}
        </div>

        {/* ── Packing List Status ───────────────────────────────────────────── */}
        {packingSlip.packingList && (
          <div style={{ marginTop: 12, padding: '6px 10px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 4, fontSize: 9, color: '#166534' }}>
            ✓ Packing List generated: <strong>{packingSlip.packingList.listNumber}</strong>
          </div>
        )}

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 14, fontSize: 8, color: '#888', textAlign: 'center', borderTop: '1px solid #e5e7eb', paddingTop: 5 }}>
          {packingSlip.slipNumber} · {do_.doNumber} · Three Shul Motors Pvt Ltd · Generated {fmtDate(packingSlip.generatedAt)}
        </div>
      </div>
    </>
  );
}
