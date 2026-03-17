'use client';

import { useEffect } from 'react';
import { Barcode128 } from '@/components/Barcode128';

type Batch = {
  id:           string;
  batchCode:    string;
  quantity:     number;
  remainingQty: number;
  unitPrice:    number;
  condition:    string;
  createdAt:    string | Date;
  rawMaterial: {
    code:     string;
    name:     string;
    unit:     string;
    category: { name: string } | null;
  };
  goodsReceipt: {
    grnNumber:  string;
    receivedAt: string | Date;
    purchaseOrder: {
      poNumber: string;
      vendor: {
        name: string;
        code: string;
      };
    };
  } | null;
};

export function PrintGRNLabel({ batch }: { batch: Batch }) {
  useEffect(() => {
    window.print();
  }, []);

  const fmtDate = (d: string | Date) =>
    new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const fmtNum = (n: number) =>
    n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  const fmtCur = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const conditionColor = batch.condition === 'GOOD' ? '#10b981' : batch.condition === 'DAMAGED' ? '#f59e0b' : '#ef4444';

  return (
    <>
      <style>{`
        @page { size: A6; margin: 5mm 6mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; }
        @media screen {
          body { background: #f0f0f0; display: flex; justify-content: center; padding: 20px; }
          .label { box-shadow: 0 4px 24px rgba(0,0,0,0.2); }
        }
      `}</style>

      <div className="label" style={{ width: '148mm', minHeight: '105mm', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: '#1a3a6b', color: '#fff', padding: '6px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>SMX DRIVES</div>
            <div style={{ fontSize: 8, opacity: 0.8, marginTop: 1 }}>Inventory Batch Label</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 8, opacity: 0.8 }}>Condition</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: conditionColor, background: 'rgba(255,255,255,0.15)', padding: '1px 6px', borderRadius: 4, marginTop: 1 }}>
              {batch.condition}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Material info */}
          <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 5 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{batch.rawMaterial.name}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
              <span style={{ fontSize: 9, color: '#6b7280' }}>Code: <strong style={{ color: '#374151' }}>{batch.rawMaterial.code}</strong></span>
              {batch.rawMaterial.category && (
                <span style={{ fontSize: 9, color: '#6b7280' }}>Cat: <strong style={{ color: '#374151' }}>{batch.rawMaterial.category.name}</strong></span>
              )}
            </div>
          </div>

          {/* Quantity & Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <div style={{ background: '#f9fafb', borderRadius: 4, padding: '4px 6px' }}>
              <div style={{ fontSize: 8, color: '#6b7280' }}>Quantity</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{fmtNum(batch.quantity)}</div>
              <div style={{ fontSize: 8, color: '#6b7280' }}>{batch.rawMaterial.unit}</div>
            </div>
            <div style={{ background: '#f9fafb', borderRadius: 4, padding: '4px 6px' }}>
              <div style={{ fontSize: 8, color: '#6b7280' }}>Remaining</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>{fmtNum(batch.remainingQty)}</div>
              <div style={{ fontSize: 8, color: '#6b7280' }}>{batch.rawMaterial.unit}</div>
            </div>
            <div style={{ background: '#f9fafb', borderRadius: 4, padding: '4px 6px' }}>
              <div style={{ fontSize: 8, color: '#6b7280' }}>Unit Price</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#111' }}>{fmtCur(batch.unitPrice)}</div>
            </div>
          </div>

          {/* GRN / PO info */}
          {batch.goodsReceipt && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div>
                <div style={{ fontSize: 8, color: '#6b7280' }}>GRN</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#1d4ed8' }}>{batch.goodsReceipt.grnNumber}</div>
              </div>
              <div>
                <div style={{ fontSize: 8, color: '#6b7280' }}>PO</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#374151' }}>{batch.goodsReceipt.purchaseOrder.poNumber}</div>
              </div>
              <div>
                <div style={{ fontSize: 8, color: '#6b7280' }}>Vendor</div>
                <div style={{ fontSize: 9, color: '#374151' }}>{batch.goodsReceipt.purchaseOrder.vendor.name}</div>
              </div>
              <div>
                <div style={{ fontSize: 8, color: '#6b7280' }}>Received</div>
                <div style={{ fontSize: 9, color: '#374151' }}>{fmtDate(batch.goodsReceipt.receivedAt)}</div>
              </div>
            </div>
          )}

          {/* Barcode */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 'auto', paddingTop: 4 }}>
            <Barcode128 value={batch.batchCode} />
            <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2, letterSpacing: 1 }}>{batch.batchCode}</div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ background: '#f3f4f6', padding: '3px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 7, color: '#9ca3af' }}>SMX Drives Inventory Management System</span>
          <span style={{ fontSize: 7, color: '#9ca3af' }}>Printed: {fmtDate(new Date().toISOString())}</span>
        </div>
      </div>
    </>
  );
}
