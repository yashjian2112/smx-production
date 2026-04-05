'use client';

import { useEffect } from 'react';

interface TradingProduct {
  name: string;
  code: string;
  serials: string[];
}

interface HarnessVariant {
  name: string;
  qty: number;
}

interface Props {
  order: {
    orderNumber: string;
    createdAt: string;
    quantity: number;
    voltage: string | null;
    priority: number | null;
    dueDate: string | null;
    client: { customerName: string; code: string } | null;
    createdBy: string;
    piNumber: string | null;
    clientPO: string | null;
    product: { name: string; code: string };
    mfgUnitCount: number;
    tradingProducts: TradingProduct[];
    harnessVariants: HarnessVariant[];
  };
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function PrintWorkOrder({ order }: Props) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 800);
    return () => clearTimeout(t);
  }, []);

  const hasTrading = order.tradingProducts.length > 0;
  const hasHarness = order.harnessVariants.length > 0;
  const totalHarness = order.harnessVariants.reduce((s, v) => s + v.qty, 0);
  const totalTrading = order.tradingProducts.reduce((s, p) => s + p.serials.length, 0);

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #fff; font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; font-size: 9pt; }

        @media print {
          @page { size: A4 portrait; margin: 10mm 12mm; }
          body { margin: 0; }
          .no-print { display: none !important; }
        }
        @media screen {
          body { background: #e5e7eb; padding: 24px; }
          .page { max-width: 210mm; margin: 0 auto; background: #fff; padding: 18mm 16mm; box-shadow: 0 4px 24px rgba(0,0,0,0.12); border-radius: 4px; }
          .no-print {
            max-width: 210mm; margin: 0 auto 16px; font-size: 13px; color: #374151;
            padding: 10px 16px; background: #fff; border: 1px solid #d1d5db; border-radius: 8px;
            display: flex; align-items: center; gap: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);
          }
        }

        .wo-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2.5px solid #111; margin-bottom: 16px; }
        .wo-title { font-size: 20pt; font-weight: 800; letter-spacing: 1px; color: #000; }
        .wo-subtitle { font-size: 8.5pt; color: #6b7280; margin-top: 2px; }
        .wo-number { font-size: 13pt; font-weight: 700; font-family: 'Courier New', monospace; }
        .wo-date { font-size: 8.5pt; color: #6b7280; margin-top: 2px; }

        .wo-badge { display: inline-block; font-size: 7.5pt; font-weight: 700; padding: 2px 10px; border-radius: 3px; letter-spacing: 0.5px; margin-top: 6px; }
        .badge-priority-HIGH { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .badge-priority-URGENT { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .badge-priority-NORMAL { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }

        .info-grid { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .info-grid td { padding: 6px 10px; border: 1px solid #e5e7eb; font-size: 9pt; }
        .info-label { font-weight: 600; color: #374151; background: #f9fafb; width: 22%; }
        .info-value { color: #111; width: 28%; }

        .section-title { font-size: 10.5pt; font-weight: 700; color: #111; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1.5px solid #d1d5db; }

        .product-box { border: 2px solid #111; border-radius: 6px; padding: 14px 16px; margin-bottom: 16px; }
        .product-name { font-size: 13pt; font-weight: 700; color: #000; }
        .product-code { font-size: 8.5pt; color: #6b7280; margin-top: 1px; }
        .product-qty { font-size: 12pt; font-weight: 700; color: #111; }
        .product-meta { display: flex; gap: 24px; margin-top: 8px; }
        .product-meta-item { font-size: 8.5pt; color: #6b7280; }
        .product-meta-item strong { color: #111; font-weight: 600; }

        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 9pt; }
        .items-table th { padding: 6px 10px; background: #111; color: #fff; font-weight: 600; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; }
        .items-table td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
        .items-table tr:last-child td { border-bottom: 2px solid #111; }

        .sig-row { display: flex; justify-content: space-between; margin-top: 48px; padding-top: 0; }
        .sig-block { text-align: center; width: 28%; }
        .sig-line { border-top: 1px solid #374151; margin-bottom: 4px; }
        .sig-label { font-size: 8.5pt; color: #6b7280; }

        .checklist { margin-top: 20px; border: 1.5px solid #d1d5db; border-radius: 6px; padding: 12px 16px; }
        .checklist-title { font-size: 9pt; font-weight: 700; color: #374151; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .checklist-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 9pt; color: #374151; }
        .checklist-box { width: 12px; height: 12px; border: 1.5px solid #9ca3af; border-radius: 2px; flex-shrink: 0; }
      `}</style>

      <div className="no-print">
        <span><strong>Work Order:</strong> {order.orderNumber}</span>
        <button
          onClick={() => window.print()}
          style={{ padding: '7px 20px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
        >
          Print
        </button>
      </div>

      <div className="page">
        {/* ── Header ── */}
        <div className="wo-header">
          <div>
            <div className="wo-title">WORK ORDER</div>
            <div className="wo-subtitle">Three Shul Motors Pvt. Ltd.</div>
            {order.priority != null && order.priority > 0 && (
              <span className={`wo-badge ${order.priority >= 2 ? 'badge-priority-HIGH' : 'badge-priority-NORMAL'}`}>
                {order.priority >= 2 ? 'URGENT' : 'HIGH'} PRIORITY
              </span>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="wo-number">{order.orderNumber}</div>
            <div className="wo-date">{fmtDate(order.createdAt)}</div>
          </div>
        </div>

        {/* ── Order Info ── */}
        <table className="info-grid">
          <tbody>
            <tr>
              <td className="info-label">Customer</td>
              <td className="info-value">{order.client?.customerName ?? '—'}</td>
              <td className="info-label">Total Quantity</td>
              <td className="info-value" style={{ fontWeight: 700 }}>{order.quantity} units</td>
            </tr>
            <tr>
              <td className="info-label">PI Number</td>
              <td className="info-value" style={{ fontFamily: "'Courier New', monospace" }}>{order.piNumber ?? '—'}</td>
              <td className="info-label">Client PO</td>
              <td className="info-value">{order.clientPO ?? '—'}</td>
            </tr>
            <tr>
              <td className="info-label">Due Date</td>
              <td className="info-value" style={{ fontWeight: 600 }}>{order.dueDate ? fmtDate(order.dueDate) : '—'}</td>
              <td className="info-label">Created By</td>
              <td className="info-value">{order.createdBy}</td>
            </tr>
          </tbody>
        </table>

        {/* ── Main Product ── */}
        <div className="product-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="product-name">{order.product.name}</div>
              <div className="product-code">Code: {order.product.code}</div>
            </div>
            <div className="product-qty">{order.mfgUnitCount} PCS</div>
          </div>
          {(order.voltage || hasHarness) && (
            <div className="product-meta">
              {order.voltage && (
                <span className="product-meta-item">Voltage: <strong>{order.voltage}</strong></span>
              )}
            </div>
          )}
        </div>

        {/* ── Harness Variants ── */}
        {hasHarness && (
          <div style={{ marginBottom: 16 }}>
            <div className="section-title">Harness Units — {totalHarness} PCS</div>
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: '8%' }}>#</th>
                  <th>Variant</th>
                  <th style={{ width: '20%', textAlign: 'right' }}>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {order.harnessVariants.map((v, i) => (
                  <tr key={v.name}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{v.name}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{v.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Trading Items ── */}
        {hasTrading && (
          <div style={{ marginBottom: 16 }}>
            <div className="section-title">Trading Items — {totalTrading} PCS</div>
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ width: '8%' }}>#</th>
                  <th>Product</th>
                  <th style={{ width: '15%' }}>Code</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {order.tradingProducts.map((p, i) => (
                  <tr key={p.code}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td style={{ fontFamily: "'Courier New', monospace", fontSize: '8.5pt' }}>{p.code}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{p.serials.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Production Checklist ── */}
        <div className="checklist">
          <div className="checklist-title">Production Checklist</div>
          <div className="checklist-row"><div className="checklist-box" /> Materials issued</div>
          <div className="checklist-row"><div className="checklist-box" /> Production started</div>
          <div className="checklist-row"><div className="checklist-box" /> QC completed</div>
          <div className="checklist-row"><div className="checklist-box" /> Final assembly done</div>
          <div className="checklist-row"><div className="checklist-box" /> Ready for dispatch</div>
        </div>

        {/* ── Signatures ── */}
        <div className="sig-row">
          <div className="sig-block">
            <div className="sig-line" />
            <div className="sig-label">Prepared By</div>
          </div>
          <div className="sig-block">
            <div className="sig-line" />
            <div className="sig-label">Approved By</div>
          </div>
          <div className="sig-block">
            <div className="sig-line" />
            <div className="sig-label">Received By</div>
          </div>
        </div>
      </div>
    </>
  );
}
