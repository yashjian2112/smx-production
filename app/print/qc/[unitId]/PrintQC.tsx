'use client';

import { useEffect } from 'react';
import { QRCodeCanvas } from '@/components/QRCode';

type QCRecord = {
  id: string;
  result: string;
  remarks: string;
  tester: string;
  issueCategory: string;
  createdAt: string;
};

export function PrintQC({
  serialNumber,
  orderNumber,
  productName,
  productCode,
  qcBarcode,
  firmwareVersion,
  softwareVersion,
  qcRecords,
}: {
  serialNumber: string;
  orderNumber: string;
  productName: string;
  productCode: string;
  qcBarcode: string;
  firmwareVersion: string;
  softwareVersion: string;
  qcRecords: QCRecord[];
}) {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { margin: 0; background: white; }
        .no-print { display: none !important; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 10px; text-align: left; }
        th { background: #f0f0f0; font-weight: bold; }
      }
      body { font-family: 'Courier New', monospace; background: white; color: black; padding: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 10px; text-align: left; }
      th { background: #f0f0f0; font-weight: bold; }
    `;
    document.head.appendChild(style);
    const t = setTimeout(() => window.print(), 800);
    return () => { clearTimeout(t); style.remove(); };
  }, []);

  const latestResult = qcRecords[0]?.result;

  return (
    <>
      <div style={{ maxWidth: 700, margin: '0 auto', background: 'white', color: 'black', padding: '24px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid black', paddingBottom: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 'bold', letterSpacing: 2 }}>SMX DRIVES</div>
            <div style={{ fontSize: 11, marginTop: 2 }}>QC Test Report</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            {qcBarcode && <QRCodeCanvas value={qcBarcode} size={80} dark="#000000" light="#ffffff" />}
            <div style={{ fontSize: 9, fontFamily: 'monospace', marginTop: 4 }}>{qcBarcode}</div>
          </div>
        </div>

        {/* Unit info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 11 }}>
          <div><b>Product:</b> {productCode} — {productName}</div>
          <div><b>Order:</b> {orderNumber}</div>
          <div><b>Serial:</b> <span style={{ fontFamily: 'monospace' }}>{serialNumber}</span></div>
          <div><b>QC Barcode:</b> <span style={{ fontFamily: 'monospace' }}>{qcBarcode}</span></div>
          {firmwareVersion && <div><b>Firmware:</b> {firmwareVersion}</div>}
          {softwareVersion && <div><b>Software:</b> {softwareVersion}</div>}
        </div>

        {/* Overall result */}
        <div style={{
          padding: '10px 16px',
          borderRadius: 6,
          marginBottom: 16,
          border: `2px solid ${latestResult === 'PASS' ? '#16a34a' : latestResult === 'FAIL' ? '#dc2626' : '#ccc'}`,
          background: latestResult === 'PASS' ? '#f0fdf4' : latestResult === 'FAIL' ? '#fef2f2' : '#f9f9f9',
        }}>
          <span style={{ fontSize: 13, fontWeight: 'bold' }}>
            Overall Result:{' '}
            <span style={{ color: latestResult === 'PASS' ? '#16a34a' : latestResult === 'FAIL' ? '#dc2626' : '#888' }}>
              {latestResult ?? 'PENDING'}
            </span>
          </span>
        </div>

        {/* QC records table */}
        {qcRecords.length > 0 ? (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>Test History</div>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date / Time</th>
                  <th>Result</th>
                  <th>Tester</th>
                  <th>Issue Category</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {qcRecords.map((r, i) => (
                  <tr key={r.id}>
                    <td>{i + 1}</td>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td style={{ color: r.result === 'PASS' ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>{r.result}</td>
                    <td>{r.tester}</td>
                    <td>{r.issueCategory}</td>
                    <td>{r.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ padding: '12px', border: '1px solid #ccc', borderRadius: 4, color: '#888', fontSize: 11, marginBottom: 20 }}>
            No QC records found.
          </div>
        )}

        {/* Sign-off */}
        <div style={{ marginTop: 24, border: '1px solid #ccc', borderRadius: 4, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 12 }}>Inspector Sign-off</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Inspector Name:</div>
              <div style={{ borderBottom: '1px solid black', height: 20 }}></div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Signature:</div>
              <div style={{ borderBottom: '1px solid black', height: 20 }}></div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Date:</div>
              <div style={{ borderBottom: '1px solid black', height: 20 }}></div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>Final Decision:</div>
              <div style={{ borderBottom: '1px solid black', height: 20 }}></div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, fontSize: 8, color: '#888', borderTop: '1px solid #eee', paddingTop: 8 }}>
          Generated by SMX Drives Production System. Scan QC barcode to verify online records.
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
