'use client';

import { useEffect } from 'react';
import { QRCodeCanvas } from '@/components/QRCode';

const QC_ITEMS = [
  { key: 'vin',         label: 'VIN'         },
  { key: 'aux_supply',  label: 'AUX Supply'  },
  { key: 'resolver',    label: 'Resolver'    },
  { key: 'kill_switch', label: 'Kill Switch' },
  { key: 'mode',        label: 'Mode'        },
  { key: 'can',         label: 'CAN'         },
  { key: 'hall',        label: 'Hall'        },
  { key: 'throttle',    label: 'Throttle'    },
  { key: 'cruise',      label: 'Cruise'      },
  { key: 'usb',         label: 'USB'         },
  { key: 'vincos',      label: 'VINCOS'      },
] as const;

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
  checklistData,
  qcRecords,
}: {
  serialNumber: string;
  orderNumber: string;
  productName: string;
  productCode: string;
  qcBarcode: string;
  firmwareVersion: string;
  softwareVersion: string;
  checklistData: Record<string, { status: string; value: string }> | null;
  qcRecords: QCRecord[];
}) {
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @page {
        size: A4 portrait;
        margin: 8mm 12mm 8mm 12mm;
      }
      @media print {
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        html, body { margin: 0; padding: 0; background: white; }
        .no-print { display: none !important; }
        .page-root { box-shadow: none !important; }
      }
      * { box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        background: #eef2f7;
        color: #0f172a;
        margin: 0;
        padding: 0;
      }
    `;
    document.head.appendChild(style);
    const t = setTimeout(() => window.print(), 700);
    return () => { clearTimeout(t); style.remove(); };
  }, []);

  const latestResult = qcRecords[0]?.result;
  const isPass  = latestResult === 'PASS';
  const isFail  = latestResult === 'FAIL';

  const passCount  = QC_ITEMS.filter(i => checklistData?.[i.key]?.status === 'PASS').length;
  const failCount  = QC_ITEMS.filter(i => checklistData?.[i.key]?.status === 'FAIL').length;
  const naCount    = QC_ITEMS.filter(i => checklistData?.[i.key]?.status === 'NA'  ).length;

  const s = {
    // shared reusable inline styles
    label: { fontSize: 7, fontWeight: 700, letterSpacing: 1.2, color: '#94a3b8', textTransform: 'uppercase' as const, marginBottom: 2 },
    divider: { borderBottom: '1px solid #e2e8f0', margin: '5px 0' },
  };

  return (
    <>
      {/* ── A4 PAGE ROOT ─────────────────────────────────────────────────────── */}
      <div className="page-root" style={{
        width: 794,
        minHeight: 1123,
        maxHeight: 1123,
        margin: '0 auto',
        background: 'white',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 4px 32px rgba(0,0,0,0.12)',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
      }}>

        {/* ── HEADER ────────────────────────────────────────────────────── */}
        <div style={{ background: '#0f172a', color: 'white', padding: '10px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 20, fontWeight: 900, letterSpacing: 3, color: '#38bdf8' }}>SMX</span>
              <span style={{ fontSize: 10, color: '#64748b', letterSpacing: 2 }}>DRIVES</span>
              <span style={{ fontSize: 9, color: '#334155', marginLeft: 8, letterSpacing: 1 }}>Quality Control Test Certificate</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)',
                borderRadius: 5, padding: '4px 12px',
              }}>
                <div>
                  <div style={{ fontSize: 7, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>Controller</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: '#f8fafc', letterSpacing: 1, lineHeight: 1 }}>SMX{productCode}</div>
                  <div style={{ fontSize: 8, color: '#94a3b8' }}>{productName}</div>
                </div>
              </div>
              {/* Verdict badge inline in header */}
              <div style={{
                display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                background: isPass ? '#14532d' : isFail ? '#450a0a' : '#1e293b',
                border: `1px solid ${isPass ? '#16a34a' : isFail ? '#dc2626' : '#334155'}`,
                borderRadius: 5, padding: '4px 14px',
              }}>
                <div style={{ fontSize: 7, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 1 }}>QC Result</div>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 2, color: isPass ? '#4ade80' : isFail ? '#f87171' : '#94a3b8', lineHeight: 1 }}>
                  {latestResult ?? '—'}
                </div>
                <div style={{ fontSize: 7, color: '#64748b', marginTop: 1 }}>{passCount}P · {failCount}F · {naCount}N/A</div>
              </div>
            </div>
          </div>
          {/* QR Code */}
          <div style={{ textAlign: 'center' }}>
            {qcBarcode
              ? <QRCodeCanvas value={qcBarcode} size={68} dark="#f8fafc" light="#0f172a" />
              : <div style={{ width: 68, height: 68, background: '#1e293b', borderRadius: 3 }} />
            }
            <div style={{ fontSize: 8, fontFamily: 'monospace', marginTop: 4, color: '#38bdf8', letterSpacing: 0.5 }}>
              {qcBarcode || '—'}
            </div>
          </div>
        </div>

        {/* ── CONTROL STRIP ─────────────────────────────────────────────── */}
        <div style={{
          background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0',
          padding: '3px 22px', display: 'flex', fontSize: 8, color: '#64748b',
        }}>
          {[
            ['DOC',    `QCR-${qcBarcode}`],
            ['SERIAL', serialNumber],
            ['ORDER',  orderNumber],
            ['ISSUED', qcRecords[0] ? new Date(qcRecords[0].createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase() : '—'],
            ['TESTER', qcRecords[0]?.tester ?? '—'],
            ['FW',     firmwareVersion || '—'],
            ['ATTEMPTS', String(qcRecords.length)],
          ].map(([k, v], i, arr) => (
            <div key={k} style={{ flex: 1, padding: '3px 8px', borderRight: i < arr.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
              <div style={{ fontWeight: 700, letterSpacing: 0.6, marginBottom: 1, fontSize: 7 }}>{k}</div>
              <div style={{ color: '#0f172a', fontFamily: k === 'SERIAL' || k === 'DOC' || k === 'FW' ? 'monospace' : 'inherit', fontSize: 8 }}>{v}</div>
            </div>
          ))}
        </div>

        {/* ── TEST RESULTS TABLE ─────────────────────────────────────────── */}
        <div style={{ padding: '8px 22px', flex: 1 }}>
          <div style={{ ...s.label, paddingBottom: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 6 }}>
            Test Parameters &amp; Results — {QC_ITEMS.length} Items
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={{ padding: '5px 8px', width: 22, textAlign: 'center', fontWeight: 600, fontSize: 8 }}>#</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600, fontSize: 8, width: '26%' }}>Parameter</th>
                <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: 600, fontSize: 8 }}>Measured Value</th>
                <th style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 600, fontSize: 8, width: 56 }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {QC_ITEMS.map((item, i) => {
                const check  = checklistData?.[item.key];
                const isNA   = check?.status === 'NA';
                const isPAss = check?.status === 'PASS';
                const isFItem = check?.status === 'FAIL';
                return (
                  <tr key={item.key} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '4px 8px', color: '#94a3b8', textAlign: 'center', fontWeight: 600, fontSize: 9 }}>{i + 1}</td>
                    <td style={{ padding: '4px 8px', fontWeight: 600, color: '#0f172a', fontSize: 10 }}>{item.label}</td>
                    <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: 10, color: isNA ? '#94a3b8' : isFItem ? '#b91c1c' : '#0f172a', fontStyle: !check ? 'italic' : 'normal' }}>
                      {check?.value || (!check ? 'No data' : isFItem ? 'FAIL' : '—')}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 6px', borderRadius: 3,
                        fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
                        background: isNA ? '#f1f5f9' : isPAss ? '#dcfce7' : isFItem ? '#fee2e2' : '#f1f5f9',
                        color:      isNA ? '#64748b' : isPAss ? '#15803d' : isFItem ? '#b91c1c' : '#94a3b8',
                        border: `1px solid ${isNA ? '#e2e8f0' : isPAss ? '#86efac' : isFItem ? '#fca5a5' : '#e2e8f0'}`,
                      }}>
                        {isNA ? 'N/A' : isPAss ? 'PASS' : isFItem ? 'FAIL' : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <div style={{ width: 70, padding: '4px 8px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 4, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#15803d', lineHeight: 1 }}>{passCount}</div>
              <div style={{ fontSize: 7, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>Passed</div>
            </div>
            <div style={{ width: 70, padding: '4px 8px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#b91c1c', lineHeight: 1 }}>{failCount}</div>
              <div style={{ fontSize: 7, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>Failed</div>
            </div>
            <div style={{ width: 70, padding: '4px 8px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 4, textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#475569', lineHeight: 1 }}>{naCount}</div>
              <div style={{ fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>N/A</div>
            </div>
            <div style={{ flex: 1, padding: '5px 10px', background: isPass ? '#f0fdf4' : isFail ? '#fef2f2' : '#fffbeb', border: `1px solid ${isPass ? '#86efac' : isFail ? '#fca5a5' : '#fde68a'}`, borderRadius: 4 }}>
              <div style={{ fontSize: 7, color: isPass ? '#166534' : isFail ? '#991b1b' : '#92400e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                Certification Statement
              </div>
              <div style={{ fontSize: 9, color: '#44403c', lineHeight: 1.5 }}>
                {isPass
                  ? `This SMX${productCode} has been tested against all QC parameters and is certified compliant. Approved to proceed to Final Assembly.`
                  : isFail
                  ? `This unit has failed one or more QC parameters and is NOT approved to proceed. Return to Assembly for rework before re-testing.`
                  : 'QC result pending.'}
              </div>
            </div>
          </div>
        </div>

        {/* ── TEST HISTORY (compact, only if multiple attempts) ─────────── */}
        {qcRecords.length > 1 && (
          <div style={{ padding: '0 22px 6px', flexShrink: 0 }}>
            <div style={{ ...s.label, paddingBottom: 3, borderBottom: '1px solid #e2e8f0', marginBottom: 5 }}>
              Test Attempt History ({qcRecords.length} attempts)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  {['#', 'Date', 'Result', 'Tester', 'Remarks'].map((h, i) => (
                    <th key={h} style={{ padding: '3px 8px', textAlign: i === 2 ? 'center' : 'left', fontWeight: 700, fontSize: 7.5, color: '#475569', letterSpacing: 0.4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qcRecords.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '3px 8px', color: '#94a3b8', width: 20, textAlign: 'center', fontSize: 8 }}>{i + 1}</td>
                    <td style={{ padding: '3px 8px', fontSize: 8 }}>
                      {new Date(r.createdAt).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td style={{ padding: '3px 8px', textAlign: 'center' }}>
                      <span style={{ padding: '1px 5px', borderRadius: 2, fontSize: 7.5, fontWeight: 700,
                        background: r.result === 'PASS' ? '#dcfce7' : '#fee2e2',
                        color: r.result === 'PASS' ? '#15803d' : '#b91c1c',
                        border: `1px solid ${r.result === 'PASS' ? '#86efac' : '#fca5a5'}` }}>
                        {r.result}
                      </span>
                    </td>
                    <td style={{ padding: '3px 8px', fontSize: 8 }}>{r.tester}</td>
                    <td style={{ padding: '3px 8px', color: '#64748b', fontStyle: r.remarks ? 'normal' : 'italic', fontSize: 8 }}>{r.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── SIGN-OFF ──────────────────────────────────────────────────── */}
        <div style={{ margin: '0 22px 8px', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '4px 14px', ...s.label }}>
            Authorisation &amp; Sign-off
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '10px 16px', gap: 16 }}>
            {['QC Inspector', 'Quality Manager', 'Final Approval'].map((role) => (
              <div key={role}>
                <div style={{ fontSize: 8, color: '#94a3b8', marginBottom: 3, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{role}</div>
                <div style={{ borderBottom: '1.5px solid #334155', height: 26, marginBottom: 3 }} />
                <div style={{ fontSize: 7, color: '#94a3b8' }}>Name &amp; Signature</div>
                <div style={{ borderBottom: '1px solid #e2e8f0', height: 18, marginTop: 5, marginBottom: 3 }} />
                <div style={{ fontSize: 7, color: '#94a3b8' }}>Date</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FOOTER ────────────────────────────────────────────────────── */}
        <div style={{
          margin: '0 22px 10px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: '1px solid #e2e8f0', paddingTop: 5, flexShrink: 0,
        }}>
          <div style={{ fontSize: 7, color: '#94a3b8', lineHeight: 1.6 }}>
            <span style={{ fontWeight: 700, color: '#475569' }}>SMX DRIVES — PRODUCTION QUALITY ASSURANCE</span>
            {' · '}Scan the QC barcode to verify against the live production database.
          </div>
          <div style={{ textAlign: 'right', fontSize: 7, color: '#94a3b8', flexShrink: 0 }}>
            <div style={{ fontWeight: 600, color: '#475569' }}>DOC: QCR-{qcBarcode}</div>
            <div>Printed: {new Date().toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}</div>
          </div>
        </div>

      </div>

      {/* ── PRINT BUTTON (screen only) ──────────────────────────────────── */}
      <div className="no-print" style={{ padding: '14px', textAlign: 'center', background: '#f1f5f9', borderTop: '1px solid #e2e8f0' }}>
        <button onClick={() => window.print()} style={{ padding: '9px 24px', background: '#0f172a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          Print / Save as PDF
        </button>
        <span style={{ marginLeft: 14, fontSize: 11, color: '#64748b' }}>Opens print dialog automatically</span>
      </div>
    </>
  );
}
