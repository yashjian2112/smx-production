'use client';

import { useEffect } from 'react';
import { Barcode128 } from '@/components/Barcode128';

type BoxItem = {
  id: string;
  unit: { serialNumber: string };
};

type DispatchOrder = {
  doNumber: string;
  totalBoxes: number | null;
  createdAt: string | Date;
  order: {
    orderNumber: string;
    client: {
      customerName: string;
      state: string | null;
    } | null;
    product: { code: string; name: string };
    proformaInvoice?: { shippingRoute: string | null } | null;
  };
};

type BoxSizeInfo = {
  name: string;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

type Box = {
  id: string;
  boxNumber: number;
  boxLabel: string;
  isSealed: boolean;
  weightKg: number | null;
  boxSize: BoxSizeInfo | null;
  createdAt: string | Date;
  dispatchOrder: DispatchOrder;
  items: BoxItem[];
};

type Settings = Record<string, string>;

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PrintBoxLabel({ box, settings }: { box: Box; settings: Settings }) {
  const s = (k: string) => settings[k] ?? '';
  const coName = s('company_name') || 'SMX Drives';
  const order = box.dispatchOrder.order;
  const client = order.client;
  const totalBoxes = box.dispatchOrder.totalBoxes ?? '?';
  const shippingRoute = order.proformaInvoice?.shippingRoute;

  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        @page { size: A5 landscape; margin: 4mm 5mm; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
      `}</style>

      {/* Screen controls */}
      <div className="no-print" style={{ padding: '10px 16px', background: '#18181b', display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
        <button onClick={() => window.print()}
          style={{ background: '#1a3a6b', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
          Print Label
        </button>
        <button onClick={() => window.close()}
          style={{ background: '#3f3f46', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13 }}>
          Close
        </button>
      </div>

      <div style={{
        border: '3px solid #000',
        width: '200mm',
        minHeight: '138mm',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* ── TOP BAR: Company + DO + Order ── */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#000',
          color: '#fff',
          padding: '6px 12px',
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1 }}>{coName}</div>
          <div style={{ textAlign: 'right', fontSize: 10 }}>
            <span style={{ fontWeight: 700 }}>{box.dispatchOrder.doNumber}</span>
            <span style={{ margin: '0 6px', opacity: 0.5 }}>|</span>
            <span>{order.orderNumber}</span>
          </div>
        </div>

        {/* ── DISPATCH MODE BANNER ── */}
        {shippingRoute && (
          <div style={{
            textAlign: 'center',
            fontSize: 20,
            fontWeight: 900,
            textTransform: 'uppercase' as const,
            letterSpacing: 4,
            padding: '6px 10px',
            borderBottom: '3px solid #000',
            color: '#000',
          }}>
            DISPATCH BY {shippingRoute}
          </div>
        )}

        {/* ── BOX NUMBER — large and bold ── */}
        <div style={{
          textAlign: 'center',
          padding: '10px 10px 6px',
          borderBottom: '2px solid #000',
        }}>
          <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: 2, lineHeight: 1, color: '#000' }}>
            BOX {box.boxNumber}
            <span style={{ fontSize: 20, fontWeight: 600, color: '#555', marginLeft: 4 }}>/ {totalBoxes}</span>
          </div>
          <div style={{ fontSize: 10, color: '#444', marginTop: 2, fontFamily: 'monospace' }}>{box.boxLabel}</div>
        </div>

        {/* ── BARCODE ── */}
        <div style={{ textAlign: 'center', padding: '6px 10px', borderBottom: '1px solid #ccc' }}>
          <Barcode128
            value={box.boxLabel}
            width={1.8}
            height={44}
            fontSize={0}
            displayValue={false}
            background="#ffffff"
            lineColor="#000000"
          />
        </div>

        {/* ── INFO GRID: 2×2 ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderBottom: '2px solid #000',
        }}>
          {/* Customer */}
          <div style={{ padding: '6px 10px', borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc' }}>
            <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#555', marginBottom: 2 }}>Customer</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#000' }}>{client?.customerName ?? '—'}</div>
            {client?.state && <div style={{ fontSize: 9, color: '#444' }}>{client.state}</div>}
          </div>
          {/* Product */}
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #ccc' }}>
            <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#555', marginBottom: 2 }}>Product</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#000' }}>{order.product.code}</div>
            <div style={{ fontSize: 9, color: '#444' }}>{order.product.name}</div>
          </div>
          {/* Weight */}
          <div style={{ padding: '6px 10px', borderRight: '1px solid #ccc' }}>
            <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#555', marginBottom: 2 }}>Weight</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#000' }}>{box.weightKg != null ? `${box.weightKg} kg` : '—'}</div>
          </div>
          {/* Box Size */}
          <div style={{ padding: '6px 10px' }}>
            <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#555', marginBottom: 2 }}>Box Size</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#000' }}>
              {box.boxSize
                ? `${box.boxSize.name} (${box.boxSize.lengthCm}x${box.boxSize.widthCm}x${box.boxSize.heightCm} cm)`
                : '—'}
            </div>
          </div>
        </div>

        {/* ── SERIAL NUMBERS ── */}
        <div style={{ padding: '6px 10px', flex: 1 }}>
          <div style={{ fontSize: 7, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#555', marginBottom: 4 }}>
            Contents — {box.items.length} unit{box.items.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 8px' }}>
            {box.items.map((item) => (
              <span key={item.id} style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: '#000',
                background: '#f0f0f0',
                border: '1px solid #ccc',
                borderRadius: 3,
                padding: '2px 6px',
                fontWeight: 600,
              }}>
                {item.unit.serialNumber}
              </span>
            ))}
            {box.items.length === 0 && <span style={{ fontSize: 9, color: '#aaa', fontStyle: 'italic' }}>No items scanned yet</span>}
          </div>
        </div>

        {/* ── FOOTER ── */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '5px 10px',
          borderTop: '2px solid #000',
          background: '#f5f5f5',
        }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: '#333' }}>{fmtDate(box.createdAt)}</span>
          <span style={{
            fontSize: 9,
            fontWeight: 800,
            padding: '2px 10px',
            borderRadius: 10,
            color: '#fff',
            background: box.isSealed ? '#166534' : '#92400e',
            textTransform: 'uppercase' as const,
            letterSpacing: 0.5,
          }}>
            {box.isSealed ? 'SEALED' : 'OPEN'}
          </span>
          <span style={{ fontSize: 8, color: '#666' }}>{coName} Production System</span>
        </div>

      </div>
    </>
  );
}
