'use client';

import { useEffect, useMemo, useState } from 'react';
import { Barcode128 } from '@/components/Barcode128';

const MONTH_CODES = ['JA', 'FE', 'MR', 'AP', 'MY', 'JN', 'JL', 'AU', 'SE', 'OC', 'NO', 'DE'] as const;

function padSequence(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 3);
  return digits.padStart(3, '0');
}

function currentYear2() {
  return String(new Date().getFullYear() % 100).padStart(2, '0');
}

function currentMonthCode() {
  return MONTH_CODES[new Date().getMonth()] ?? 'JA';
}

export function ManualFinalLabel({
  initialProductCode,
  initialProductName,
}: {
  initialProductCode: string;
  initialProductName: string;
}) {
  const [productCode, setProductCode] = useState(initialProductCode.toUpperCase());
  const [productName, setProductName] = useState(initialProductName);
  const [sequence, setSequence] = useState('001');
  const [manualSerial, setManualSerial] = useState('');

  const generatedSerial = useMemo(() => {
    const code = productCode.trim().toUpperCase();
    if (!code) return '';
    return `${code}${currentYear2()}${currentMonthCode()}${padSequence(sequence)}`;
  }, [productCode, sequence]);

  const finalSerial = manualSerial.trim().toUpperCase() || generatedSerial;

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body.manual-final-print * { visibility: hidden; }
        body.manual-final-print #manual-final-label,
        body.manual-final-print #manual-final-label * { visibility: visible; }
        body.manual-final-print #manual-final-label {
          position: fixed;
          inset: 0;
          background: white;
          color: black;
          padding: 24px;
        }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);

    function onBeforePrint() {
      document.body.classList.add('manual-final-print');
    }
    function onAfterPrint() {
      document.body.classList.remove('manual-final-print');
    }

    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      document.body.classList.remove('manual-final-print');
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      style.remove();
    };
  }, []);

  return (
    <div className="min-h-dvh p-4" style={{ fontFamily: 'var(--font-poppins, sans-serif)' }}>
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="no-print flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.close()}
            className="text-sm text-zinc-500 hover:text-white transition-colors"
          >
            ← Close
          </button>
        </div>

        <div className="grid lg:grid-cols-[340px_1fr] gap-4">
          <div className="no-print card p-5 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold">Admin Only</p>
              <h1 className="text-xl font-semibold text-white mt-1">Manual Final Assembly Label</h1>
              <p className="text-sm text-zinc-400 mt-2">
                Print a controller serial sticker directly for Final Assembly.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Product Code</label>
                <input
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value.toUpperCase())}
                  className="input-field text-sm"
                  placeholder="e.g. SM350"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Product Name (optional)</label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="input-field text-sm"
                  placeholder="e.g. SM350 Controller"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Sequence</label>
                <input
                  value={sequence}
                  onChange={(e) => setSequence(padSequence(e.target.value))}
                  className="input-field text-sm font-mono"
                  placeholder="001"
                />
                <p className="text-[11px] text-zinc-600 mt-1">
                  Format: {productCode.trim().toUpperCase() || 'MODEL'}{currentYear2()}{currentMonthCode()}{padSequence(sequence)}
                </p>
              </div>

              <div>
                <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Manual Serial Override (optional)</label>
                <input
                  value={manualSerial}
                  onChange={(e) => setManualSerial(e.target.value.toUpperCase())}
                  className="input-field text-sm font-mono"
                  placeholder="Enter full serial if needed"
                />
              </div>
            </div>

            <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.18)' }}>
              <p className="text-amber-300 font-medium">Preview Serial</p>
              <p className="font-mono text-zinc-100 mt-1">{finalSerial || '—'}</p>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              disabled={!finalSerial}
              className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: '#0ea5e9', color: '#fff' }}
            >
              Print Final Label
            </button>
          </div>

          <div id="manual-final-label" className="card p-6" style={{ background: '#fff', color: '#111' }}>
            <div style={{ borderBottom: '2px solid #111', paddingBottom: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 2 }}>SMX DRIVES</div>
              <div style={{ fontSize: 11, marginTop: 2 }}>Manual Final Assembly Serial Label</div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>
                {productCode.trim().toUpperCase() || 'MODEL'}{productName.trim() ? ` — ${productName.trim()}` : ''}
              </div>
              <div style={{ fontSize: 10, color: '#555' }}>
                Batch: {currentMonthCode()} · Year: {currentYear2()}
              </div>
            </div>

            <div style={{ border: '2px solid #000', borderRadius: 6, padding: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: 8, color: '#333' }}>
                Final Assembly Serial Label
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#111', marginBottom: 8 }}>
                NOTE: Warranty Void If Removed
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#444', marginBottom: 10 }}>
                Serial Number
              </div>
              {finalSerial && (
                <Barcode128
                  value={finalSerial}
                  width={2.4}
                  height={72}
                  fontSize={13}
                  background="#ffffff"
                  lineColor="#000000"
                />
              )}
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#111', marginTop: 6, fontWeight: 700, letterSpacing: 1.5 }}>
                {finalSerial || '—'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
