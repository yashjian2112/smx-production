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
      @page { size: A4; margin: 12mm 14mm 12mm 14mm; }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        body { margin: 0; background: white; }
        .no-print { display: none !important; }
      }
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
        background: #eef2f7;
        color: #0f172a;
        margin: 0;
        padding: 0;
      }
    `;
    document.head.appendChild(style);
    const t = setTimeout(() => window.print(), 900);
    return () => { clearTimeout(t); style.remove(); };
  }, []);

  const latestResult = qcRecords[0]?.result;
  const isPass = latestResult === 'PASS';
  const isFail = latestResult === 'FAIL';

  const infoRows: [string, string, boolean?][] = [
    ['Product', `${productCode} — ${productName}`],
    ['Order No.', orderNumber],
    ['Unit Serial', serialNumber, true],
    ...(firmwareVersion ? [['Firmware', firmwareVersion] as [string, string]] : []),
    ...(softwareVersion ? [['Software', softwareVersion] as [string, string]] : []),
  ];

  return (
    <>
      {/* ── DOCUMENT ─────────────────────────────────────────────────── */}
      <div style={{
        maxWidth: 794,
        margin: '0 auto',
        background: 'white',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
        boxShadow: '0 4px 32px rgba(0,0,0,0.10)',
      }}>

        {/* ── HEADER BAR ──────────────────────────────────────────────── */}
        <div style={{
          background: '#0f172a',
          color: 'white',
          padding: '18px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          {/* Brand */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: 3, color: '#38bdf8' }}>SMX</span>
              <span style={{ fontSize: 14, fontWeight: 400, color: '#94a3b8', letterSpacing: 2 }}>DRIVES</span>
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, letterSpacing: 2, textTransform: 'uppercase' }}>
              Quality Control Test Certificate
            </div>
          </div>

          {/* QC Barcode — primary scan identifier */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: '#64748b', letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' }}>QC Scan Code</div>
            {qcBarcode
              ? <QRCodeCanvas value={qcBarcode} size={76} dark="#f8fafc" light="#0f172a" />
              : <div style={{ width: 76, height: 76, background: '#1e293b', borderRadius: 4 }} />
            }
            <div style={{ fontSize: 9, fontFamily: 'monospace', marginTop: 5, color: '#38bdf8', letterSpacing: 1 }}>
              {qcBarcode || '—'}
            </div>
          </div>
        </div>

        {/* ── DOCUMENT CONTROL STRIP ──────────────────────────────────── */}
        <div style={{
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          padding: '6px 28px',
          display: 'flex',
          gap: 0,
          fontSize: 9,
          color: '#64748b',
        }}>
          {[
            ['DOC NO', `QCR-${qcBarcode}`],
            ['ISSUED', qcRecords[0]
              ? new Date(qcRecords[0].createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
              : '—'],
            ['REV', String(qcRecords.length).padStart(2, '0')],
            ['PAGE', '1 OF 1'],
            ['STATUS', latestResult ?? 'PENDING'],
          ].map(([k, v], i) => (
            <div key={k} style={{
              flex: 1,
              padding: '4px 10px',
              borderRight: i < 4 ? '1px solid #e2e8f0' : 'none',
            }}>
              <div style={{ fontWeight: 700, letterSpacing: 0.8, marginBottom: 1 }}>{k}</div>
              <div style={{ color: k === 'STATUS' ? (isPass ? '#15803d' : isFail ? '#b91c1c' : '#94a3b8') : '#0f172a', fontWeight: k === 'STATUS' ? 700 : 400 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* ── BODY ────────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 28px', display: 'flex', gap: 20 }}>

          {/* Unit info table */}
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#94a3b8',
              textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6,
              borderBottom: '1px solid #e2e8f0',
            }}>
              Unit Identification
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <tbody>
                {infoRows.map(([label, value, mono]) => (
                  <tr key={label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '5px 0 5px 0', color: '#64748b', width: 88, fontSize: 10, fontWeight: 600, verticalAlign: 'top', paddingRight: 10 }}>
                      {label}
                    </td>
                    <td style={{ padding: '5px 0', fontFamily: mono ? 'monospace' : 'inherit', color: '#0f172a', fontSize: 11 }}>
                      {value}
                    </td>
                  </tr>
                ))}

                {/* QC Barcode row — prominent */}
                <tr>
                  <td style={{ padding: '8px 10px 8px 0', color: '#0369a1', fontSize: 10, fontWeight: 700, verticalAlign: 'middle' }}>
                    QC Barcode
                  </td>
                  <td style={{ padding: '8px 0' }}>
                    <span style={{
                      fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                      color: '#0284c7', background: '#f0f9ff',
                      border: '1px solid #bae6fd', borderRadius: 4,
                      padding: '3px 8px', display: 'inline-block', letterSpacing: 1,
                    }}>
                      {qcBarcode || '—'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Result verdict panel */}
          <div style={{
            width: 164,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${isPass ? '#16a34a' : isFail ? '#dc2626' : '#cbd5e1'}`,
            borderRadius: 10,
            background: isPass ? '#f0fdf4' : isFail ? '#fef2f2' : '#f9fafb',
            padding: '20px 12px',
            gap: 6,
            flexShrink: 0,
          }}>
            <div style={{ fontSize: 8, letterSpacing: 2, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              QC Verdict
            </div>

            {isPass && (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            {isFail && (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            {!isPass && !isFail && (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}

            <div style={{
              fontSize: 38, fontWeight: 900, letterSpacing: 3, lineHeight: 1,
              color: isPass ? '#15803d' : isFail ? '#b91c1c' : '#94a3b8',
            }}>
              {latestResult ?? '—'}
            </div>

            <div style={{ width: '100%', height: 1, background: isPass ? '#bbf7d0' : isFail ? '#fecaca' : '#e2e8f0', margin: '4px 0' }} />

            <div style={{ fontSize: 9, color: '#64748b', textAlign: 'center', lineHeight: 1.5 }}>
              {qcRecords.length} test record{qcRecords.length !== 1 ? 's' : ''}<br />
              {qcRecords[0] && (
                <span>
                  {new Date(qcRecords[0].createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── TEST HISTORY TABLE ──────────────────────────────────────── */}
        <div style={{ padding: '0 28px 20px' }}>
          <div style={{
            fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#94a3b8',
            textTransform: 'uppercase', marginBottom: 10, paddingBottom: 6,
            borderBottom: '1px solid #e2e8f0',
          }}>
            Test History
          </div>

          {qcRecords.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: '#0f172a', color: 'white' }}>
                  {['#', 'Date / Time', 'Result', 'Tester', 'Issue Category', 'Remarks'].map((h, i) => (
                    <th key={h} style={{
                      padding: '7px 10px', textAlign: i === 2 ? 'center' : 'left',
                      fontWeight: 600, letterSpacing: 0.5, fontSize: 9,
                      width: i === 0 ? 24 : i === 2 ? 56 : 'auto',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qcRecords.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 10px', color: '#94a3b8', textAlign: 'center' }}>{i + 1}</td>
                    <td style={{ padding: '6px 10px' }}>
                      {new Date(r.createdAt).toLocaleString('en-GB', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 3,
                        fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                        background: r.result === 'PASS' ? '#dcfce7' : r.result === 'FAIL' ? '#fee2e2' : '#f1f5f9',
                        color: r.result === 'PASS' ? '#15803d' : r.result === 'FAIL' ? '#b91c1c' : '#64748b',
                        border: `1px solid ${r.result === 'PASS' ? '#86efac' : r.result === 'FAIL' ? '#fca5a5' : '#e2e8f0'}`,
                      }}>
                        {r.result}
                      </span>
                    </td>
                    <td style={{ padding: '6px 10px' }}>{r.tester}</td>
                    <td style={{ padding: '6px 10px', color: '#64748b' }}>{r.issueCategory || '—'}</td>
                    <td style={{ padding: '6px 10px', color: '#64748b', fontStyle: r.remarks ? 'normal' : 'italic' }}>
                      {r.remarks || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{
              padding: '16px', border: '1px solid #e2e8f0', borderRadius: 6,
              color: '#94a3b8', fontSize: 10, textAlign: 'center',
              background: '#f8fafc',
            }}>
              No test records found.
            </div>
          )}
        </div>

        {/* ── AUTHORISATION & SIGN-OFF ──────────────────────────────── */}
        <div style={{ margin: '0 28px 20px', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
            padding: '7px 16px', fontSize: 8, fontWeight: 700,
            letterSpacing: 1.5, color: '#94a3b8', textTransform: 'uppercase',
          }}>
            Authorisation &amp; Sign-off
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '16px 20px', gap: 24 }}>
            {['QC Inspector', 'Quality Manager', 'Final Approval'].map((role) => (
              <div key={role}>
                <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 6, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  {role}
                </div>
                <div style={{ borderBottom: '1.5px solid #334155', height: 36, marginBottom: 5 }} />
                <div style={{ fontSize: 8, color: '#94a3b8' }}>Name &amp; Signature</div>
                <div style={{ borderBottom: '1px solid #e2e8f0', height: 24, marginTop: 10, marginBottom: 4 }} />
                <div style={{ fontSize: 8, color: '#94a3b8' }}>Date</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <div style={{
          margin: '0 28px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderTop: '1px solid #e2e8f0', paddingTop: 10, gap: 20,
        }}>
          <div style={{ fontSize: 8, color: '#94a3b8', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, letterSpacing: 1, color: '#475569', marginBottom: 2 }}>SMX DRIVES — PRODUCTION QUALITY ASSURANCE</div>
            <div>This document is electronically generated. Scan the QC barcode above to verify against the live production database.</div>
            <div>Any reproduction or modification of this document without authorisation is strictly prohibited.</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 8, color: '#94a3b8', lineHeight: 1.7, flexShrink: 0 }}>
            <div style={{ fontWeight: 600, color: '#475569' }}>DOC: QCR-{qcBarcode}</div>
            <div>Printed: {new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

      </div>

      {/* ── PRINT BUTTON (screen only) ────────────────────────────────── */}
      <div className="no-print" style={{
        padding: '16px', textAlign: 'center',
        background: '#f1f5f9', borderTop: '1px solid #e2e8f0',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
      }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: '10px 28px', background: '#0f172a', color: 'white',
            border: 'none', borderRadius: 6, cursor: 'pointer',
            fontSize: 13, fontWeight: 600, letterSpacing: 0.5,
          }}
        >
          🖨️ Print / Save as PDF
        </button>
        <span style={{ marginLeft: 16, fontSize: 11, color: '#64748b' }}>
          Print dialog opens automatically
        </span>
      </div>
    </>
  );
}
