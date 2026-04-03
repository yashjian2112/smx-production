'use client';

import { useEffect } from 'react';

export default function PrintHarnessQC({
  barcode,
  serialNumber,
  productCode,
  orderNumber,
  assignedTo,
  status,
  qcData,
  remarks,
  updatedAt,
}: {
  barcode: string;
  serialNumber: string;
  productCode: string;
  orderNumber: string;
  assignedTo: string;
  status: string;
  qcData: Record<string, { status: string; remarks?: string; name?: string }>;
  remarks: string | null;
  updatedAt: string;
}) {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 800);
    return () => clearTimeout(timer);
  }, []);

  const entries = Object.entries(qcData);
  const allPassed = entries.every(([, v]) => v.status === 'PASS');
  const passCount = entries.filter(([, v]) => v.status === 'PASS').length;
  const failCount = entries.filter(([, v]) => v.status === 'FAIL').length;
  const dateStr = new Date(updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = new Date(updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ background: '#fff', color: '#000', minHeight: '100vh', padding: '16px' }}>
      <style>{`
        @media print {
          @page { margin: 12mm; size: A4 portrait; }
          body { margin: 0; padding: 0; background: #fff; }
          .no-print { display: none !important; }
        }
        .qc-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        .qc-table th, .qc-table td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; font-size: 12px; }
        .qc-table th { background: #f3f4f6; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
        .qc-table td.pass { color: #059669; font-weight: 600; }
        .qc-table td.fail { color: #dc2626; font-weight: 600; }
      `}</style>

      {/* Report */}
      <div style={{ maxWidth: '700px', margin: '0 auto', fontFamily: 'Arial, sans-serif' }}>
        {/* Header */}
        <div style={{ borderBottom: '2px solid #000', paddingBottom: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '1px' }}>SMX DRIVES</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginTop: '4px' }}>Harness QC Inspection Report</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: 700,
                background: allPassed ? '#d1fae5' : '#fee2e2',
                color: allPassed ? '#059669' : '#dc2626',
                border: `1px solid ${allPassed ? '#6ee7b7' : '#fca5a5'}`,
              }}>
                {allPassed ? 'PASSED' : 'FAILED'}
              </div>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px', marginBottom: '20px' }}>
          <div>
            <div style={{ color: '#6b7280', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Barcode</div>
            <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '13px' }}>{barcode}</div>
          </div>
          <div>
            <div style={{ color: '#6b7280', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Serial Number</div>
            <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '13px' }}>{serialNumber}</div>
          </div>
          <div>
            <div style={{ color: '#6b7280', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Product</div>
            <div style={{ fontWeight: 600 }}>{productCode}</div>
          </div>
          <div>
            <div style={{ color: '#6b7280', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Order</div>
            <div style={{ fontWeight: 600 }}>{orderNumber}</div>
          </div>
          <div>
            <div style={{ color: '#6b7280', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tested By</div>
            <div style={{ fontWeight: 600 }}>{assignedTo}</div>
          </div>
          <div>
            <div style={{ color: '#6b7280', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date / Time</div>
            <div style={{ fontWeight: 600 }}>{dateStr} {timeStr}</div>
          </div>
        </div>

        {/* Summary */}
        <div style={{
          display: 'flex', gap: '16px', marginBottom: '16px', padding: '10px 16px',
          background: '#f9fafb', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '12px',
        }}>
          <div>Total Connectors: <strong>{entries.length}</strong></div>
          <div style={{ color: '#059669' }}>Passed: <strong>{passCount}</strong></div>
          {failCount > 0 && <div style={{ color: '#dc2626' }}>Failed: <strong>{failCount}</strong></div>}
        </div>

        {/* Connector Results Table */}
        <table className="qc-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>#</th>
              <th>Connector</th>
              <th style={{ width: '80px' }}>Result</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([connId, result], i) => (
              <tr key={connId}>
                <td>{i + 1}</td>
                <td>{result.name || connId.slice(0, 8)}</td>
                <td className={result.status === 'PASS' ? 'pass' : 'fail'}>{result.status}</td>
                <td style={{ color: '#6b7280', fontStyle: result.remarks ? 'italic' : 'normal' }}>
                  {result.remarks || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Notes */}
        {remarks && (
          <div style={{ marginTop: '16px', padding: '10px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', color: '#92400e', marginBottom: '4px' }}>Remarks</div>
            <div style={{ color: '#78350f' }}>{remarks}</div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#9ca3af' }}>
          <div>SMX Drives — Harness QC Report</div>
          <div>Generated: {new Date().toLocaleDateString('en-IN')}</div>
        </div>

        {/* Signature line */}
        <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ width: '200px', borderTop: '1px solid #000', paddingTop: '4px', fontSize: '10px', textAlign: 'center' }}>
            QC Inspector
          </div>
          <div style={{ width: '200px', borderTop: '1px solid #000', paddingTop: '4px', fontSize: '10px', textAlign: 'center' }}>
            Supervisor
          </div>
        </div>
      </div>

      {/* Screen-only controls */}
      <div className="no-print" style={{ marginTop: '20px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
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
