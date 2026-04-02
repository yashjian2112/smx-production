'use client';

import { useEffect } from 'react';

interface ProductGroup {
  name: string;
  code: string;
  productType: string;
  serials: string[];
}

interface Props {
  order: {
    orderNumber: string;
    createdAt: string;
    quantity: number;
    voltage: string | null;
    dueDate: string | null;
    client: { customerName: string; code: string } | null;
    createdBy: string;
    piNumber: string | null;
    clientPO: string | null;
    products: ProductGroup[];
  };
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function PrintWorkOrder({ order }: Props) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 800);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #fff; font-family: Arial, sans-serif; color: #000; }

        @media print {
          @page { size: A4 portrait; margin: 12mm 10mm; }
          body { margin: 0; }
          .no-print { display: none !important; }
        }

        @media screen {
          body { background: #eee; padding: 20px; }
          .page { max-width: 210mm; margin: 0 auto; background: #fff; padding: 20mm 15mm; box-shadow: 0 2px 12px rgba(0,0,0,0.15); }
          .no-print {
            max-width: 210mm; margin: 0 auto 12px; font-size: 13px; color: #333;
            padding: 8px 14px; background: #fff; border: 1px solid #ccc; border-radius: 6px;
            display: flex; align-items: center; gap: 12px;
          }
        }
      `}</style>

      <div className="no-print">
        <span><strong>Work Order:</strong> {order.orderNumber}</span>
        <button onClick={() => window.print()}
          style={{ padding: '6px 16px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          Print
        </button>
      </div>

      <div className="page">
        {/* Header */}
        <div style={{ borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: '18pt', fontWeight: 'bold', letterSpacing: '0.5px' }}>WORK ORDER</h1>
              <p style={{ fontSize: '8pt', color: '#666', marginTop: '2px' }}>Three Shul Motors Pvt. Ltd.</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '10pt', fontWeight: 'bold' }}>{order.orderNumber}</p>
              <p style={{ fontSize: '8pt', color: '#666' }}>Date: {fmtDate(order.createdAt)}</p>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontSize: '9pt', fontWeight: 'bold', color: '#b45309', background: '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>
              TRADING ORDER
            </span>
          </div>
        </div>

        {/* Order Info Grid */}
        <table style={{ width: '100%', fontSize: '9pt', borderCollapse: 'collapse', marginBottom: '16px' }}>
          <tbody>
            <tr>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', width: '25%', background: '#f5f5f5', border: '1px solid #ddd' }}>Customer</td>
              <td style={{ padding: '4px 8px', width: '25%', border: '1px solid #ddd' }}>{order.client?.customerName ?? '—'}</td>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', width: '25%', background: '#f5f5f5', border: '1px solid #ddd' }}>Trading Items</td>
              <td style={{ padding: '4px 8px', width: '25%', border: '1px solid #ddd' }}>{order.products.reduce((s, p) => s + p.serials.length, 0)} units</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', background: '#f5f5f5', border: '1px solid #ddd' }}>PI Number</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{order.piNumber ?? '—'}</td>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', background: '#f5f5f5', border: '1px solid #ddd' }}>Client PO</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{order.clientPO ?? '—'}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', background: '#f5f5f5', border: '1px solid #ddd' }}>Due Date</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{order.dueDate ? fmtDate(order.dueDate) : '—'}</td>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', background: '#f5f5f5', border: '1px solid #ddd' }}>Created By</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{order.createdBy}</td>
            </tr>
          </tbody>
        </table>

        {/* Product-wise breakdown */}
        {order.products.map((p, idx) => (
          <div key={p.code} style={{ padding: '12px', border: '2px solid #000', borderRadius: '4px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '14pt', fontWeight: 'bold' }}>{idx + 1}. {p.name}</p>
              <p style={{ fontSize: '12pt' }}>Qty: <strong>{p.serials.length}</strong></p>
            </div>
            <p style={{ fontSize: '8pt', color: '#666' }}>Code: {p.code}</p>
          </div>
        ))}

        {/* Signature */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', fontSize: '9pt' }}>
          <div>
            <div style={{ borderTop: '1px solid #000', width: '150px', marginBottom: '4px' }} />
            <p>Prepared By</p>
          </div>
          <div>
            <div style={{ borderTop: '1px solid #000', width: '150px', marginBottom: '4px' }} />
            <p>Approved By</p>
          </div>
          <div>
            <div style={{ borderTop: '1px solid #000', width: '150px', marginBottom: '4px' }} />
            <p>Received By</p>
          </div>
        </div>
      </div>
    </>
  );
}
