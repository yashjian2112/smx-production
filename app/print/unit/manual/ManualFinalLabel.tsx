'use client';

import { useEffect, useMemo, useState } from 'react';
import { Barcode128 } from '@/components/Barcode128';

const MONTH_CODES = ['JA', 'FE', 'MR', 'AP', 'MY', 'JN', 'JL', 'AU', 'SE', 'OC', 'NO', 'DE'] as const;
type Tab = 'print' | 'history';
type GeneratedSerial = { serial: string; copies: number };
type PrintableSticker = { serial: string; copyNumber: number; totalCopies: number };

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
  const [tab, setTab] = useState<Tab>('print');
  const [productCode, setProductCode] = useState(initialProductCode.toUpperCase());
  const [productName, setProductName] = useState(initialProductName);
  const [startSequence, setStartSequence] = useState('001');
  const [qty, setQty] = useState(1);
  const [copies, setCopies] = useState(1);
  const [manualPrefix, setManualPrefix] = useState('');
  const [stickers, setStickers] = useState<PrintableSticker[]>([]);
  const [history, setHistory] = useState<GeneratedSerial[]>([]);

  const computedPrefix = useMemo(() => {
    const code = productCode.trim().toUpperCase();
    if (!code) return '';
    return `${code}${currentYear2()}${currentMonthCode()}`;
  }, [productCode]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @page { margin: 0; size: 50mm 25mm; }
        html, body { margin: 0 !important; padding: 0 !important; width: 50mm !important; background: white !important; }
        .no-print { display: none !important; }
        .print-root { min-height: 0 !important; padding: 0 !important; margin: 0 !important; width: 50mm !important; }
        .print-sheet,
        .sticker-grid { display: block; width: 50mm; margin: 0; padding: 0; }
        .sticker {
          width: 50mm;
          height: 25mm;
          margin: 0;
          border: 0;
          border-radius: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          break-inside: avoid;
          page-break-inside: avoid;
          break-after: page;
          page-break-after: always;
          background: white;
          color: black;
        }
        .sticker:last-child { break-after: auto; page-break-after: auto; }
      }
    `;
    document.head.appendChild(style);
    const t = setTimeout(() => {
      if (stickers.length > 0) window.print();
    }, 150);
    return () => {
      clearTimeout(t);
      style.remove();
    };
  }, [stickers]);

  function buildSerials() {
    const prefix = (manualPrefix.trim().toUpperCase() || computedPrefix).trim();
    if (!prefix) return [];
    const start = Number(padSequence(startSequence));
    return Array.from({ length: qty }, (_, index) => {
      const seq = String(start + index).padStart(3, '0');
      return { serial: `${prefix}${seq}`, copies };
    });
  }

  function generateAndPrint() {
    const generated = buildSerials();
    const printable = generated.flatMap((item) =>
      Array.from({ length: item.copies }, (_, index) => ({
        serial: item.serial,
        copyNumber: index + 1,
        totalCopies: item.copies,
      }))
    );
    setStickers(printable);
    setHistory((prev) => [...generated, ...prev]);
  }

  return (
    <div className="print-root min-h-dvh p-4" style={{ fontFamily: 'var(--font-poppins, sans-serif)' }}>
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[340px_1fr] gap-4">
        <div className="no-print space-y-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.close()}
              className="text-sm text-zinc-500 hover:text-white transition-colors"
            >
              ← Close
            </button>
          </div>

          <div className="card p-5 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold">Admin Only</p>
              <h1 className="text-xl font-semibold text-white mt-1">Manual Final Sticker</h1>
              <p className="text-sm text-zinc-400 mt-2">
                Print controller final stickers in the same small-label format as regular labels.
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
                <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Product Name</label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="input-field text-sm"
                  placeholder="e.g. SM350"
                />
              </div>

              <div>
                <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Prefix</label>
                <input
                  value={manualPrefix}
                  onChange={(e) => setManualPrefix(e.target.value.toUpperCase())}
                  className="input-field text-sm font-mono"
                  placeholder={computedPrefix || 'Auto from product + year + batch'}
                />
                <p className="text-[11px] text-zinc-600 mt-1">Auto prefix: {computedPrefix || '—'}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Start Sequence</label>
                  <input
                    value={startSequence}
                    onChange={(e) => setStartSequence(padSequence(e.target.value))}
                    className="input-field text-sm font-mono"
                    placeholder="001"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Qty</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={qty}
                    onChange={(e) => setQty(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                    className="input-field text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Copies</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                    className="input-field text-sm font-mono"
                  />
                </div>
              </div>

              <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <span className="text-sky-400 font-semibold">Qty</span> = new serial numbers
                <span className="text-zinc-600 mx-2">|</span>
                <span className="text-amber-400 font-semibold">Copies</span> = same serial prints multiple times
              </div>
            </div>

            <button
              type="button"
              onClick={generateAndPrint}
              disabled={!(manualPrefix.trim() || computedPrefix)}
              className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: '#0ea5e9', color: '#fff' }}
            >
              Generate {qty} serial{qty !== 1 ? 's' : ''} · Print {qty * copies} sticker{qty * copies !== 1 ? 's' : ''}
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <button
                type="button"
                onClick={() => setTab('print')}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'print' ? 'text-sky-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                style={tab === 'print' ? { borderBottom: '2px solid #38bdf8', marginBottom: -1 } : {}}
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => setTab('history')}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'history' ? 'text-sky-400' : 'text-zinc-500 hover:text-zinc-300'}`}
                style={tab === 'history' ? { borderBottom: '2px solid #38bdf8', marginBottom: -1 } : {}}
              >
                History {history.length > 0 ? history.length : ''}
              </button>
            </div>
            <div className="p-4">
              {tab === 'print' ? (
                <div className="text-sm text-zinc-500">
                  {stickers.length === 0
                    ? 'Set qty and copies, then click Generate & Print.'
                    : `${qty} serial${qty !== 1 ? 's' : ''} generated · ${stickers.length} sticker${stickers.length !== 1 ? 's' : ''} ready.`}
                </div>
              ) : history.length === 0 ? (
                <div className="text-sm text-zinc-500">No manual final stickers yet.</div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {history.map((item, index) => (
                    <div key={`${item.serial}-${index}`} className="rounded-lg px-3 py-2 text-sm font-mono text-zinc-200" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {item.serial}
                      <span className="ml-2 text-xs text-zinc-500">x{item.copies}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="print-sheet">
            <div className="sticker-grid">
              {stickers.map((sticker, index) => (
                <div key={`${sticker.serial}-${index}`} className="sticker">
                  <div
                    style={{
                      width: '46mm',
                      height: '21mm',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '0.8mm',
                      background: '#fff',
                      color: '#111',
                      padding: '1.2mm 1.6mm',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        fontSize: '1.25mm',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05mm',
                        lineHeight: 1.05,
                        textAlign: 'center',
                      }}
                    >
                      NOTE: Warranty Void If Removed
                    </div>
                    <div style={{ fontSize: '1.7mm', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.35mm', color: '#444' }}>
                      Serial Number
                    </div>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                      <Barcode128
                        value={sticker.serial}
                        width={1.4}
                        height={24}
                        displayValue={false}
                        fontSize={9}
                        background="#ffffff"
                        lineColor="#000000"
                      />
                    </div>
                    <div style={{ fontSize: '2.5mm', fontWeight: 800, fontFamily: 'monospace', letterSpacing: '0.16mm', lineHeight: 1 }}>
                      {sticker.serial}
                    </div>
                    {sticker.totalCopies > 1 && (
                      <div style={{ fontSize: '1.55mm', fontWeight: 700, color: '#444', lineHeight: 1 }}>
                        Copy {sticker.copyNumber} / {sticker.totalCopies}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
