'use client';

import { useEffect } from 'react';
import { Barcode128 } from '@/components/Barcode128';

export default function PrintHarness({
  barcode,
  serialNumber,
  productCode,
  productName,
  orderNumber,
  harnessModel,
}: {
  barcode: string;
  serialNumber: string;
  productCode: string;
  productName: string;
  orderNumber: string;
  harnessModel?: string | null;
}) {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ background: '#fff', color: '#000', minHeight: '100vh', padding: '16px' }}>
      <style>{`
        @media print {
          @page { margin: 6mm; size: 80mm 50mm; }
          body { margin: 0; padding: 0; background: #fff; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Print label */}
      <div style={{
        width: '76mm',
        padding: '4mm',
        border: '1px solid #ccc',
        fontFamily: 'Arial, sans-serif',
        fontSize: '10px',
        lineHeight: '1.4',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1px' }}>SMX DRIVES</div>
          <div style={{ fontSize: '9px', color: '#666', marginTop: '1mm' }}>HARNESS UNIT</div>
        </div>

        <div style={{ textAlign: 'center', margin: '3mm 0' }}>
          <Barcode128
            value={barcode}
            width={2}
            height={40}
            fontSize={11}
            background="#ffffff"
            lineColor="#000000"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginTop: '2mm' }}>
          <div>
            <div style={{ color: '#888', fontSize: '7px', textTransform: 'uppercase' }}>Serial</div>
            <div style={{ fontWeight: 600 }}>{serialNumber}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#888', fontSize: '7px', textTransform: 'uppercase' }}>Product</div>
            <div style={{ fontWeight: 600 }}>{productCode}</div>
          </div>
        </div>

        <div style={{ fontSize: '8px', color: '#666', marginTop: '2mm', textAlign: 'center' }}>
          {orderNumber}{harnessModel ? ` — ${harnessModel}` : ''}
        </div>
      </div>

      {/* Screen-only controls */}
      <div className="no-print" style={{ marginTop: '20px', display: 'flex', gap: '8px' }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '8px 16px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
        >
          Print Again
        </button>
        <button
          onClick={() => window.close()}
          style={{ padding: '8px 16px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
