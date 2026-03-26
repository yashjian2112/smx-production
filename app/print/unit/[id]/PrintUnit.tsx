'use client';

import { useEffect } from 'react';
import { QRCodeCanvas } from '@/components/QRCode';
import { Barcode128 } from '@/components/Barcode128';
import { Star } from 'lucide-react';

export function PrintUnit({
  serialNumber,
  orderNumber,
  productName,
  productCode,
  powerstageBarcode,
  brainboardBarcode,
  qcBarcode,
  finalAssemblyBarcode,
  createdAt,
}: {
  serialNumber: string;
  orderNumber: string;
  productName: string;
  productCode: string;
  powerstageBarcode: string;
  brainboardBarcode: string;
  qcBarcode: string;
  finalAssemblyBarcode: string;
  createdAt: string;
}) {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { margin: 0; background: white; }
        .no-print { display: none !important; }
      }
      body { font-family: 'Courier New', monospace; background: white; color: black; padding: 20px; }
    `;
    document.head.appendChild(style);
    const t = setTimeout(() => window.print(), 800);
    return () => { clearTimeout(t); style.remove(); };
  }, []);

  const barcodes = [
    { label: 'Powerstage',     value: powerstageBarcode,     isFinal: false },
    { label: 'Brainboard',     value: brainboardBarcode,     isFinal: false },
    { label: 'QC',             value: qcBarcode,             isFinal: false },
    { label: 'Final Assembly', value: finalAssemblyBarcode,  isFinal: true  },
  ];

  return (
    <>
      <div style={{ maxWidth: 600, margin: '0 auto', background: 'white', color: 'black', padding: '24px' }}>
        {/* Header */}
        <div style={{ borderBottom: '2px solid black', paddingBottom: 12, marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 'bold', letterSpacing: 2 }}>SMX DRIVES</div>
          <div style={{ fontSize: 11, marginTop: 2 }}>Production Unit Label</div>
        </div>

        {/* Unit info */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
            <span><b>Product:</b> {productCode} — {productName}</span>
            <span><b>Order:</b> {orderNumber}</span>
          </div>
          <div style={{ fontSize: 12 }}>
            <b>Serial:</b> <span style={{ fontFamily: 'monospace', fontSize: 14 }}>{serialNumber}</span>
          </div>
          <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>
            Created: {new Date(createdAt).toLocaleDateString()}
          </div>
        </div>

        {/* Barcodes grid */}
        {/* Top row: Powerstage + Brainboard + QC (QR codes) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          {barcodes.filter(b => !b.isFinal).map(({ label, value }) => (
            <div key={label} style={{ border: '1px solid #ccc', borderRadius: 6, padding: 10, textAlign: 'center' }}>
              {value && <QRCodeCanvas value={value} size={88} dark="#000000" light="#ffffff" />}
              <div style={{ fontSize: 9, fontWeight: 'bold', marginTop: 5, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
              <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#444', marginTop: 2 }}>{value || '—'}</div>
            </div>
          ))}
        </div>

        {/* Bottom: Final Assembly — customer label */}
        {barcodes.filter(b => b.isFinal).map(({ label, value }) => (
          <div key={label} style={{ border: '2px solid #000', borderRadius: 6, padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8, color: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Star className="w-4 h-4 inline mr-1" /> {label} — Serial Number Label
            </div>
            <div style={{ fontSize: 10, fontWeight: 'bold', color: '#111', marginBottom: 8 }}>
              NOTE: Warranty Void If Removed
            </div>
            <div style={{ fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1.5, color: '#444', marginBottom: 8 }}>
              Serial Number
            </div>
            {value && <Barcode128 value={value} width={2.5} height={70} fontSize={13} background="#ffffff" lineColor="#000000" />}
            <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#111', marginTop: 4, fontWeight: 'bold', letterSpacing: 2 }}>{value || '—'}</div>
          </div>
        ))}

        {/* Footer */}
        <div style={{ marginTop: 20, borderTop: '1px solid #ccc', paddingTop: 10, fontSize: 9, color: '#888' }}>
          Scan any barcode to cross-verify complete controller history. SMX Drives Production System.
        </div>
      </div>

      <div className="no-print" style={{ padding: 20, textAlign: 'center' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '10px 24px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
        >
          Print
        </button>
        <span style={{ marginLeft: 16, fontSize: 12, color: '#888' }}>Print dialog opens automatically</span>
      </div>
    </>
  );
}
