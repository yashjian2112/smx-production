'use client';

import { useEffect } from 'react';
import { QRCodeCanvas } from '@/components/QRCode';

// All 11 QC test items — must stay in sync with QcChecklist.tsx
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
      @page { size: A4; margin: 10mm 14mm 10mm 14mm; }
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

  const passCount  = QC_ITEMS.filter(i => checklistData?.[i.key]?.status === 'PASS').length;
  const naCount    = QC_ITEMS.filter(i => checklistData?.[i.key]?.status === 'NA').length;
  const totalTested = passCount + naCount;

  return (
    <>
      <div style={{
        maxWidth: 794,
        margin: '0 auto',
        background: 'white',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
        boxShadow: '0 4px 32px rgba(0,0,0,0.10)',
      }}>

        {/* ── HEADER ────────────────────────────────────────────────────────── */}
        <div style={{ background: '#0f172a', color: 'white', padding: '16px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>

            {/* Brand + Controller Model */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: 3, color: '#38bdf8' }}>SMX</span>
                <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b', letterSpacing: 2 }}>DRIVES</span>
              </div>
              {/* Controller model — primary */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
                borderRadius: 6, padding: '6px 14px', marginBottom: 8,
              }}>
                <div>
                  <div style={{ fontSize: 8, color: '#64748b', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>
                    Controller Model
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', letterSpacing: 1, lineHeight: 1 }}>
                    SMX{productCode}
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{productName}</div>
                </div>
              </div>
              <div style={{ fontSize: 9, color: '#475569', letterSpacing: 2, textTransform: 'uppercase' }}>
                Quality Control Test Certificate
              </div>
            </div>

            {/* QC Barcode — primary scan code */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: '#475569', letterSpacing: 1, marginBottom: 5, textTransform: 'uppercase' }}>QC Scan Code</div>
              {qcBarcode
                ? <QRCodeCanvas value={qcBarcode} size={76} dark="#f8fafc" light="#0f172a" />
                : <div style={{ width: 76, height: 76, background: '#1e293b', borderRadius: 4 }} />
              }
              <div style={{ fontSize: 9, fontFamily: 'monospace', marginTop: 5, color: '#38bdf8', letterSpacing: 1 }}>
                {qcBarcode || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* ── DOCUMENT CONTROL STRIP ──────────────────────────────────────── */}
        <div style={{
          background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
          padding: '5px 28px', display: 'flex', fontSize: 9, color: '#64748b',
        }}>
          {[
            ['DOC NO',  `QCR-${qcBarcode}`],
            ['ISSUED',  qcRecords[0]
              ? new Date(qcRecords[0].createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
              : '—'],
            ['TESTER',  qcRecords[0]?.tester ?? '—'],
            ['REV',     String(qcRecords.length).padStart(2, '0')],
            ['PAGE',    '1 OF 1'],
            ['STATUS',  latestResult ?? 'PENDING'],
          ].map(([k, v], i, arr) => (
            <div key={k} style={{
              flex: 1, padding: '4px 10px',
              borderRight: i < arr.length - 1 ? '1px solid #e2e8f0' : 'none',
            }}>
              <div style={{ fontWeight: 700, letterSpacing: 0.8, marginBottom: 1 }}>{k}</div>
              <div style={{
                color: k === 'STATUS' ? (isPass ? '#15803d' : isFail ? '#b91c1c' : '#94a3b8') : '#0f172a',
                fontWeight: k === 'STATUS' ? 700 : 400,
              }}>{v}</div>
            </div>
          ))}
        </div>

        {/* ── UNIT IDENTIFICATION + VERDICT ───────────────────────────────── */}
        <div style={{ padding: '16px 28px', display: 'flex', gap: 20 }}>

          {/* Info table */}
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#94a3b8',
              textTransform: 'uppercase', marginBottom: 8, paddingBottom: 5,
              borderBottom: '1px solid #e2e8f0',
            }}>Unit Identification</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <tbody>
                {([
                  ['Order No.',  orderNumber,   false],
                  ['Unit Serial', serialNumber,  true],
                  ['Firmware',   firmwareVersion || '—', true],
                  ['Software',   softwareVersion || '—', true],
                ] as [string, string, boolean][]).map(([label, value, mono]) => (
                  <tr key={label} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '4px 0', color: '#64748b', width: 82, fontSize: 10, fontWeight: 600, paddingRight: 10, verticalAlign: 'top' }}>
                      {label}
                    </td>
                    <td style={{ padding: '4px 0', fontFamily: mono ? 'monospace' : 'inherit', color: '#0f172a' }}>
                      {value}
                    </td>
                  </tr>
                ))}
                {/* QC Barcode — highlighted */}
                <tr>
                  <td style={{ padding: '6px 0', color: '#0369a1', fontSize: 10, fontWeight: 700 }}>QC Barcode</td>
                  <td style={{ padding: '6px 0' }}>
                    <span style={{
                      fontFamily: 'monospace', fontWeight: 700, fontSize: 12,
                      color: '#0284c7', background: '#f0f9ff',
                      border: '1px solid #bae6fd', borderRadius: 4,
                      padding: '2px 8px', letterSpacing: 1,
                    }}>
                      {qcBarcode || '—'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Verdict panel */}
          <div style={{
            width: 150, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${isPass ? '#16a34a' : isFail ? '#dc2626' : '#cbd5e1'}`,
            borderRadius: 10,
            background: isPass ? '#f0fdf4' : isFail ? '#fef2f2' : '#f9fafb',
            padding: '16px 10px', gap: 5, flexShrink: 0,
          }}>
            <div style={{ fontSize: 8, letterSpacing: 2, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>QC Verdict</div>
            {isPass && (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            {isFail && (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <div style={{
              fontSize: 34, fontWeight: 900, letterSpacing: 3, lineHeight: 1,
              color: isPass ? '#15803d' : isFail ? '#b91c1c' : '#94a3b8',
            }}>
              {latestResult ?? '—'}
            </div>
            <div style={{ width: '80%', height: 1, background: isPass ? '#bbf7d0' : isFail ? '#fecaca' : '#e2e8f0', margin: '3px 0' }} />
            <div style={{ fontSize: 9, color: '#64748b', textAlign: 'center', lineHeight: 1.5 }}>
              {totalTested}/{QC_ITEMS.length} tested<br />
              {passCount} passed · {naCount} N/A
            </div>
          </div>
        </div>

        {/* ── TEST PARAMETERS & RESULTS ────────────────────────────────────── */}
        <div style={{ padding: '0 28px 16px' }}>
          <div style={{
            fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#94a3b8',
            textTransform: 'uppercase', marginBottom: 8, paddingBottom: 5,
            borderBottom: '1px solid #e2e8f0',
          }}>
            Test Parameters &amp; Results — {QC_ITEMS.length} Items
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#0f172a', color: 'white' }}>
                <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5, width: 26, fontSize: 9 }}>#</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, letterSpacing: 0.5, width: '28%', fontSize: 9 }}>Test Parameter</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, letterSpacing: 0.5, fontSize: 9 }}>Measured Value</th>
                <th style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, letterSpacing: 0.5, width: 64, fontSize: 9 }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {QC_ITEMS.map((item, i) => {
                const check = checklistData?.[item.key];
                const isNA   = check?.status === 'NA';
                const isPAss = check?.status === 'PASS';
                return (
                  <tr key={item.key} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '5px 10px', color: '#94a3b8', textAlign: 'center', fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: '5px 10px', fontWeight: 600, color: '#0f172a' }}>{item.label}</td>
                    <td style={{ padding: '5px 10px', fontFamily: 'monospace', color: isNA ? '#94a3b8' : '#0f172a', fontStyle: !check ? 'italic' : 'normal' }}>
                      {check?.value || (!check ? 'No data recorded' : '—')}
                    </td>
                    <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: 3,
                        fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                        background: isNA ? '#f1f5f9' : isPAss ? '#dcfce7' : !check ? '#f1f5f9' : '#fee2e2',
                        color:      isNA ? '#64748b' : isPAss ? '#15803d' : !check ? '#94a3b8' : '#b91c1c',
                        border: `1px solid ${isNA ? '#e2e8f0' : isPAss ? '#86efac' : !check ? '#e2e8f0' : '#fca5a5'}`,
                      }}>
                        {isNA ? 'N/A' : isPAss ? 'PASS' : !check ? '—' : 'FAIL'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <div style={{ flex: 1, padding: '5px 10px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 4, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#15803d', lineHeight: 1 }}>{passCount}</div>
              <div style={{ fontSize: 8, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>Passed</div>
            </div>
            <div style={{ flex: 1, padding: '5px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 4, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#475569', lineHeight: 1 }}>{naCount}</div>
              <div style={{ fontSize: 8, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>N/A</div>
            </div>
            <div style={{ flex: 1, padding: '5px 10px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 4, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#b91c1c', lineHeight: 1 }}>
                {QC_ITEMS.length - passCount - naCount}
              </div>
              <div style={{ fontSize: 8, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>Failed</div>
            </div>
            <div style={{ flex: 4, padding: '6px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4 }}>
              <div style={{ fontSize: 8, color: '#92400e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                Certification Statement
              </div>
              <div style={{ fontSize: 9, color: '#44403c', lineHeight: 1.5 }}>
                {isPass
                  ? 'This SMX' + productCode + ' controller has been tested against all quality parameters and is certified compliant. Approved to proceed to Final Assembly.'
                  : isFail
                  ? 'This unit has failed one or more QC parameters and is NOT approved to proceed. Return to Assembly for rework before re-testing.'
                  : 'QC result pending.'}
              </div>
            </div>
          </div>
        </div>

        {/* ── TEST HISTORY (multi-attempt log) ────────────────────────────── */}
        {qcRecords.length > 0 && (
          <div style={{ padding: '0 28px 16px' }}>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: '#94a3b8',
              textTransform: 'uppercase', marginBottom: 8, paddingBottom: 5,
              borderBottom: '1px solid #e2e8f0',
            }}>
              Test Attempt History
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
              <thead>
                <tr style={{ background: '#0f172a', color: 'white' }}>
                  {['#', 'Date / Time', 'Result', 'Tester', 'Issue Category', 'Remarks'].map((h, i) => (
                    <th key={h} style={{ padding: '5px 10px', textAlign: i === 2 ? 'center' : 'left', fontWeight: 600, letterSpacing: 0.5, fontSize: 9 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {qcRecords.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '5px 10px', color: '#94a3b8', textAlign: 'center', width: 26 }}>{i + 1}</td>
                    <td style={{ padding: '5px 10px' }}>
                      {new Date(r.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '5px 10px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: 3,
                        fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                        background: r.result === 'PASS' ? '#dcfce7' : '#fee2e2',
                        color:      r.result === 'PASS' ? '#15803d' : '#b91c1c',
                        border: `1px solid ${r.result === 'PASS' ? '#86efac' : '#fca5a5'}`,
                      }}>
                        {r.result}
                      </span>
                    </td>
                    <td style={{ padding: '5px 10px' }}>{r.tester}</td>
                    <td style={{ padding: '5px 10px', color: '#64748b' }}>{r.issueCategory || '—'}</td>
                    <td style={{ padding: '5px 10px', color: '#64748b', fontStyle: r.remarks ? 'normal' : 'italic' }}>{r.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── AUTHORISATION & SIGN-OFF ─────────────────────────────────────── */}
        <div style={{ margin: '0 28px 16px', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
            padding: '6px 16px', fontSize: 8, fontWeight: 700,
            letterSpacing: 1.5, color: '#94a3b8', textTransform: 'uppercase',
          }}>
            Authorisation &amp; Sign-off
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '14px 20px', gap: 20 }}>
            {['QC Inspector', 'Quality Manager', 'Final Approval'].map((role) => (
              <div key={role}>
                <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 5, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{role}</div>
                <div style={{ borderBottom: '1.5px solid #334155', height: 32, marginBottom: 4 }} />
                <div style={{ fontSize: 8, color: '#94a3b8' }}>Name &amp; Signature</div>
                <div style={{ borderBottom: '1px solid #e2e8f0', height: 22, marginTop: 8, marginBottom: 4 }} />
                <div style={{ fontSize: 8, color: '#94a3b8' }}>Date</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── FOOTER ───────────────────────────────────────────────────────── */}
        <div style={{
          margin: '0 28px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderTop: '1px solid #e2e8f0', paddingTop: 8, gap: 20,
        }}>
          <div style={{ fontSize: 8, color: '#94a3b8', lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, letterSpacing: 1, color: '#475569', marginBottom: 1 }}>SMX DRIVES — PRODUCTION QUALITY ASSURANCE</div>
            <div>This document is electronically generated. Scan the QC barcode to verify against the live production database.</div>
            <div>Any reproduction or modification without authorisation is strictly prohibited.</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 8, color: '#94a3b8', lineHeight: 1.7, flexShrink: 0 }}>
            <div style={{ fontWeight: 600, color: '#475569' }}>DOC: QCR-{qcBarcode}</div>
            <div>Printed: {new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>

      </div>

      {/* ── PRINT BUTTON (screen only) ────────────────────────────────────── */}
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
