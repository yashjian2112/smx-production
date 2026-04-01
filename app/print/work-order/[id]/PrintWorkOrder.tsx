'use client';

import { useEffect } from 'react';

interface Props {
  order: {
    orderNumber: string;
    createdAt: string;
    quantity: number;
    voltage: string | null;
    dueDate: string | null;
    product: { name: string; code: string };
    client: { customerName: string; code: string } | null;
    createdBy: string;
    piNumber: string | null;
    clientPO: string | null;
    units: { serialNumber: string; barcode: string; status: string }[];
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
              <td style={{ padding: '4px 8px', fontWeight: 'bold', width: '25%', background: '#f5f5f5', border: '1px solid #ddd' }}>Product</td>
              <td style={{ padding: '4px 8px', width: '25%', border: '1px solid #ddd' }}>{order.product.name}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', background: '#f5f5f5', border: '1px solid #ddd' }}>Quantity</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{order.quantity} units</td>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', background: '#f5f5f5', border: '1px solid #ddd' }}>Due Date</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{order.dueDate ? fmtDate(order.dueDate) : '—'}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', background: '#f5f5f5', border: '1px solid #ddd' }}>PI Number</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{order.piNumber ?? '—'}</td>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', background: '#f5f5f5', border: '1px solid #ddd' }}>Client PO</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{order.clientPO ?? '—'}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', background: '#f5f5f5', border: '1px solid #ddd' }}>Created By</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{order.createdBy}</td>
              <td style={{ padding: '4px 8px', fontWeight: 'bold', background: '#f5f5f5', border: '1px solid #ddd' }}>Product Code</td>
              <td style={{ padding: '4px 8px', border: '1px solid #ddd' }}>{order.product.code}</td>
            </tr>
          </tbody>
        </table>

        {/* Unit Serial Numbers */}
        <h3 style={{ fontSize: '10pt', fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}>
          Unit Serial Numbers ({order.units.length})
        </h3>
        <table style={{ width: '100%', fontSize: '9pt', borderCollapse: 'collapse', marginBottom: '24px' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ padding: '4px 8px', border: '1px solid #ddd', textAlign: 'left', width: '10%' }}>#</th>
              <th style={{ padding: '4px 8px', border: '1px solid #ddd', textAlign: 'left', width: '45%' }}>Serial Number</th>
              <th style={{ padding: '4px 8px', border: '1px solid #ddd', textAlign: 'left', width: '30%' }}>Barcode</th>
              <th style={{ padding: '4px 8px', border: '1px solid #ddd', textAlign: 'left', width: '15%' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {order.units.map((u, i) => (
              <tr key={u.serialNumber}>
                <td style={{ padding: '3px 8px', border: '1px solid #ddd' }}>{i + 1}</td>
                <td style={{ padding: '3px 8px', border: '1px solid #ddd', fontFamily: 'Courier New, monospace' }}>{u.serialNumber}</td>
                <td style={{ padding: '3px 8px', border: '1px solid #ddd', fontFamily: 'Courier New, monospace' }}>{u.barcode || '—'}</td>
                <td style={{ padding: '3px 8px', border: '1px solid #ddd' }}>{u.status}</td>
              </tr>
            ))}
          </tbody>
        </table>

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
