'use client';

import { useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from '@/components/QRCode';

const STAGE_LABELS: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage',
  BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY: 'Assembly',
  FINAL_ASSEMBLY: 'Final Assembly',
};

type PrintState = 'idle' | 'generating' | 'confirm' | 'confirmed' | 'reprinting';
type Tab = 'print' | 'history';

export function PrintComponent({
  productId,
  name,
  partNumber,
  barcode,
  stage,
  productName,
  productCode,
  history: initialHistory,
}: {
  compId: string;
  productId: string;
  name: string;
  partNumber: string;
  barcode: string;
  stage: string;
  productName: string;
  productCode: string;
  history: { barcode: string; printedAt: Date | null }[];
}) {
  const [tab, setTab] = useState('print' as Tab);
  const [qty, setQty] = useState(1);
  const [stickers, setStickers] = useState([] as string[]);
  const [printState, setPrintState] = useState('idle' as PrintState);
  const [error, setError] = useState('');
  const [totalConfirmed, setTotalConfirmed] = useState(0);
  const [history, setHistory] = useState(initialHistory);
  const pendingBarcodes = useRef<string[]>([]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      @media print {
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @page { margin: 0; size: 50mm 25mm; }
        html, body { margin: 0 !important; padding: 0 !important; width: 50mm !important; background: white !important; overflow: hidden !important; }
        .no-print { display: none !important; }
        body.print-component * { visibility: hidden !important; }
        body.print-component .print-sheet,
        body.print-component .print-sheet * { visibility: visible !important; }
        body.print-component .print-sheet {
          position: fixed;
          inset: 0 auto auto 0;
          width: 50mm;
          margin: 0 !important;
          padding: 0 !important;
          background: white !important;
        }
        .sticker-grid { display: block; width: 50mm; margin: 0; padding: 0; }
        .sticker {
          width: 50mm;
          height: 25mm;
          margin: 0;
          border: 0;
          border-radius: 0;
          display: flex;
          align-items: center;
          gap: 2mm;
          padding: 1.5mm 2mm;
          overflow: hidden;
          break-inside: avoid;
          page-break-inside: avoid;
          break-after: page;
          page-break-after: always;
          background: white;
          color: black;
        }
        .sticker:last-child { break-after: auto; page-break-after: auto; }
        .sticker-name, .sticker-barcode, .sticker-part, .sticker-meta { color: black !important; }
      }
      .sticker-grid { display: grid; grid-template-columns: 50mm; gap: 8px; margin-top: 16px; }
      .sticker { width: 50mm; height: 25mm; border: 1px dashed rgba(255,255,255,0.15); border-radius: 6px; display: flex; align-items: center; gap: 2mm; padding: 1.5mm 2mm; overflow: hidden; background: white; color: black; }
      .sticker-text { flex: 1; min-width: 0; overflow: hidden; }
      .sticker-name { font-size: 6.5pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: black; }
      .sticker-part { font-size: 5.5pt; color: #444; font-family: monospace; margin-top: 0.5mm; }
      .sticker-barcode { font-size: 6pt; font-family: monospace; color: #111; margin-top: 1mm; font-weight: bold; letter-spacing: 0.3px; }
      .sticker-meta { font-size: 5pt; color: #666; margin-top: 0.8mm; }
    `;
    document.head.appendChild(style);
    function onAfterPrint() {
      document.body.classList.remove('print-component');
      if (pendingBarcodes.current.length > 0) setPrintState('confirm');
    }
    function onBeforePrint() {
      document.body.classList.add('print-component');
    }
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    return () => {
      document.body.classList.remove('print-component');
      style.remove();
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
    };
  }, []);

  async function generateAndPrint() {
    setError('');
    setPrintState('generating');
    try {
      const res = await fetch(`/api/products/${productId}/components/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, partNumber: partNumber || undefined, stage, qty }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to generate barcodes'); setPrintState('idle'); return; }
      pendingBarcodes.current = data.barcodes;
      setStickers(data.barcodes);
      setTimeout(() => window.print(), 400);
    } catch {
      setError('Network error');
      setPrintState('idle');
    }
  }

  async function confirmPrinted() {
    try {
      await fetch(`/api/products/${productId}/components/bulk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcodes: pendingBarcodes.current }),
      });
      const now = new Date();
      const confirmed = pendingBarcodes.current.map((bc) => ({ barcode: bc, printedAt: now }));
      setHistory((h) => [...confirmed, ...h]);
      setTotalConfirmed((c) => c + pendingBarcodes.current.length);
      pendingBarcodes.current = [];
      setStickers([]);
      setPrintState('confirmed');
      setTimeout(() => { setPrintState('idle'); setTab('history'); }, 2000);
    } catch {
      setError('Failed to confirm print status');
      setPrintState('idle');
    }
  }

  function reprint() {
    setPrintState('reprinting');
    setTimeout(() => window.print(), 200);
  }

  return (
    <div className="min-h-dvh p-4" style={{ fontFamily: 'var(--font-poppins, sans-serif)' }}>

      {/* Back button */}
      <div className="no-print max-w-lg mx-auto mb-3">
        <button
          onClick={() => window.close()}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
          Close
        </button>
      </div>

      {/* Tab bar */}
      <div className="no-print max-w-lg mx-auto mb-4 flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <button
          onClick={() => setTab('print')}
          className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: tab === 'print' ? 'rgba(14,165,233,0.15)' : 'transparent',
            color: tab === 'print' ? '#38bdf8' : '#71717a',
            border: tab === 'print' ? '1px solid rgba(14,165,233,0.25)' : '1px solid transparent',
          }}
        >
          Print
        </button>
        <button
          onClick={() => setTab('history')}
          className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          style={{
            background: tab === 'history' ? 'rgba(255,255,255,0.06)' : 'transparent',
            color: tab === 'history' ? '#e4e4e7' : '#71717a',
            border: tab === 'history' ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
          }}
        >
          History
          {history.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(255,255,255,0.1)', color: '#a1a1aa' }}>
              {history.length}
            </span>
          )}
        </button>
      </div>

      {/* Print tab */}
      {tab === 'print' && (
        <div className="no-print card max-w-lg mx-auto mb-4 p-4">
          <div className="text-white font-semibold text-base mb-1">{name}</div>
          <div className="text-zinc-400 text-xs mb-4">
            {productCode} — {productName} &nbsp;·&nbsp; {STAGE_LABELS[stage] ?? stage}
            {partNumber && <> &nbsp;·&nbsp; {partNumber}</>}
          </div>

          {printState === 'confirm' && (
            <div className="mb-4 rounded-lg p-3" style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)' }}>
              <div className="text-yellow-300 font-semibold text-sm mb-3">Did the stickers print successfully?</div>
              <div className="flex gap-2">
                <button onClick={confirmPrinted} className="btn-primary px-4 py-2 text-sm rounded-lg">
                  ✓ Yes, printed
                </button>
                <button onClick={reprint} style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
                  ↺ Reprint
                </button>
              </div>
            </div>
          )}

          {printState === 'confirmed' && (
            <div className="mb-4 rounded-lg p-3 text-sm font-semibold" style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#4ade80' }}>
              ✓ Print confirmed — {totalConfirmed} sticker{totalConfirmed !== 1 ? 's' : ''} recorded
            </div>
          )}

          {(printState === 'idle' || printState === 'generating') && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 text-sm">Qty:</span>
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="w-7 h-7 rounded-md text-white text-lg flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                >−</button>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                  className="w-14 text-center text-sm font-bold text-white rounded-md"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', padding: '4px 0' }}
                />
                <button
                  onClick={() => setQty((q) => Math.min(1000, q + 1))}
                  className="w-7 h-7 rounded-md text-white text-lg flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                >+</button>
              </div>
              <button
                onClick={generateAndPrint}
                disabled={printState === 'generating'}
                className="btn-primary px-5 py-2 text-sm rounded-lg"
              >
                {printState === 'generating' ? 'Generating…' : `Generate & Print ${qty} sticker${qty !== 1 ? 's' : ''}`}
              </button>
            </div>
          )}

          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}

          <div className="flex gap-3 mt-3 text-xs text-zinc-500">
            <span>Each sticker gets a unique barcode · 50mm × 25mm</span>
            {totalConfirmed > 0 && <span className="text-green-400 font-semibold">✓ {totalConfirmed} confirmed</span>}
          </div>
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="no-print card max-w-lg mx-auto mb-4 p-4">
          {history.length === 0 ? (
            <div className="text-center text-zinc-600 text-sm py-8">No stickers printed yet</div>
          ) : (
            <>
              <div className="text-zinc-300 font-semibold text-sm mb-3">
                {history.length} sticker{history.length !== 1 ? 's' : ''} printed
              </div>
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <span className="text-xs font-mono text-zinc-200">{h.barcode}</span>
                    <span className="text-xs text-zinc-500">
                      {h.printedAt ? new Date(h.printedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Sticker preview — only shown on print tab */}
      {tab === 'print' && (
        <>
          {stickers.length === 0 && printState === 'idle' && (
            <div className="no-print text-center text-zinc-600 text-sm mt-8">
              Set qty and click &quot;Generate &amp; Print&quot; — each sticker will get a unique barcode
            </div>
          )}
          <div className="print-sheet">
            <div className="sticker-grid">
            {stickers.map((bc, i) => (
              <div key={i} className="sticker">
                <QRCodeCanvas value={bc} size={66} dark="#000000" light="#ffffff" />
                <div className="sticker-text">
                  <div className="sticker-name">{name}</div>
                  {partNumber && <div className="sticker-part">{partNumber}</div>}
                  <div className="sticker-barcode">{bc}</div>
                  <div className="sticker-meta">{productCode} · {STAGE_LABELS[stage] ?? stage}</div>
                </div>
              </div>
            ))}
            </div>
          </div>
        </>
      )}

    </div>
  );
}
