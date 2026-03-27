'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check } from 'lucide-react';

const STAGE_LABELS: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage',
  BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY: 'Assembly',
  FINAL_ASSEMBLY: 'Final Assembly',
};

type PrintState = 'idle' | 'generating' | 'confirm' | 'confirmed' | 'reprinting';
type Tab = 'print' | 'pending' | 'history';
type PrintedSticker = { barcode: string; qrDataUrl: string };
type BarcodeRecord = { id: string; barcode: string; printedAt: string | Date | null; createdAt: string | Date };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatStamp(value: string | Date | null | undefined) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function PrintComponent({
  productId,
  name,
  partNumber,
  barcode,
  stage,
  productName,
  productCode,
  history: initialHistory,
  pending: initialPending,
}: {
  compId: string;
  productId: string;
  name: string;
  partNumber: string;
  barcode: string;
  stage: string;
  productName: string;
  productCode: string;
  history: BarcodeRecord[];
  pending: BarcodeRecord[];
}) {
  const [tab, setTab] = useState('print' as Tab);
  const [qty, setQty] = useState(1);
  const [stickers, setStickers] = useState<PrintedSticker[]>([]);
  const [printState, setPrintState] = useState('idle' as PrintState);
  const [error, setError] = useState('');
  const [lastConfirmedCount, setLastConfirmedCount] = useState(0);
  const [history, setHistory] = useState(initialHistory);
  const [pending, setPending] = useState(initialPending);
  const [printFrameHtml, setPrintFrameHtml] = useState('');
  const pendingBarcodes = useRef<string[]>([]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      @media print {
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @page { margin: 0; size: 50mm 25mm; }
        html, body { margin: 0 !important; padding: 0 !important; width: 50mm !important; background: white !important; }
        .no-print { display: none !important; }
        .print-root {
          min-height: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          width: 50mm !important;
        }
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
        .sticker-qr { width: 15mm; height: 15mm; flex: 0 0 15mm; }
        .sticker-qr canvas { width: 15mm !important; height: 15mm !important; display: block; border-radius: 0 !important; }
        .sticker-text { min-width: 0; }
        .sticker-name { font-size: 3.2mm !important; line-height: 1.05 !important; }
        .sticker-part { font-size: 2.1mm !important; margin-top: 0.5mm !important; }
        .sticker-barcode { font-size: 2.4mm !important; margin-top: 0.9mm !important; letter-spacing: 0 !important; }
        .sticker-meta { font-size: 2mm !important; margin-top: 0.7mm !important; }
        .sticker-name, .sticker-barcode, .sticker-part, .sticker-meta { color: black !important; }
      }
      .sticker-grid { display: grid; grid-template-columns: 50mm; gap: 8px; margin-top: 16px; }
      .sticker {
        width: 50mm;
        height: 25mm;
        border: 1px dashed rgba(255,255,255,0.15);
        border-radius: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: white;
        color: black;
      }
      .sticker-inner { width: 46mm; height: 21mm; display: grid; grid-template-columns: 15mm 1fr; column-gap: 2mm; align-items: center; }
      .sticker-qr { width: 15mm; height: 15mm; flex: 0 0 15mm; }
      .sticker-qr img { width: 15mm; height: 15mm; display: block; border-radius: 4px; }
      .sticker-text { flex: 1; min-width: 0; overflow: hidden; }
      .sticker-name { font-size: 6.5pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: black; }
      .sticker-part { font-size: 5.5pt; color: #444; font-family: monospace; margin-top: 0.5mm; }
      .sticker-barcode { font-size: 6pt; font-family: monospace; color: #111; margin-top: 1mm; font-weight: bold; letter-spacing: 0.3px; }
      .sticker-meta { font-size: 5pt; color: #666; margin-top: 0.8mm; }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  function buildPrintHtml(items: PrintedSticker[]) {
    const safeName = escapeHtml(name);
    const safePart = escapeHtml(partNumber);
    const safeProductCode = escapeHtml(productCode);
    const safeStage = escapeHtml(STAGE_LABELS[stage] ?? stage);
    const labels = items.map(({ barcode, qrDataUrl }) => `
      <div class="label">
        <div class="inner">
          <div class="qr"><img src="${qrDataUrl}" alt="${escapeHtml(barcode)}" /></div>
          <div class="text">
            <div class="name">${safeName}</div>
            ${safePart ? `<div class="part">${safePart}</div>` : ''}
            <div class="barcode">${escapeHtml(barcode)}</div>
            <div class="meta">${safeProductCode} · ${safeStage}</div>
          </div>
        </div>
      </div>
    `).join('');

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Component Labels</title>
          <style>
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            @page { size: 50mm 25mm; margin: 0; }
            html, body { margin: 0; padding: 0; background: #fff; width: 50mm; font-family: Arial, Helvetica, sans-serif; }
            .sheet { width: 50mm; margin: 0; padding: 0; }
            .label {
              width: 50mm;
              height: 25mm;
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
            }
            .label + .label { page-break-before: always; break-before: page; }
            .inner {
              width: 46mm;
              height: 21mm;
              display: grid;
              grid-template-columns: 15mm 1fr;
              column-gap: 2mm;
              align-items: center;
            }
            .qr img { width: 15mm; height: 15mm; display: block; }
            .text { min-width: 0; }
            .name { font-size: 3.2mm; line-height: 1.05; font-weight: 700; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .part { font-size: 2.1mm; line-height: 1.1; margin-top: 0.5mm; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .barcode { font-size: 2.4mm; line-height: 1.1; margin-top: 0.9mm; color: #000; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .meta { font-size: 2mm; line-height: 1.1; margin-top: 0.7mm; color: #444; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          </style>
        </head>
        <body>
          <div class="sheet">${labels}</div>
          <script>
            window.addEventListener('load', function () {
              setTimeout(function () {
                window.focus();
                window.print();
              }, 250);
            });
          </script>
        </body>
      </html>
    `;
  }

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
      const createdItems: BarcodeRecord[] = Array.isArray(data.items)
        ? data.items.map((item: { id: string; barcode: string; createdAt: string }) => ({
            id: item.id,
            barcode: item.barcode,
            createdAt: item.createdAt,
            printedAt: null,
          }))
        : (data.barcodes as string[]).map((barcode) => ({
            id: barcode,
            barcode,
            createdAt: new Date().toISOString(),
            printedAt: null,
          }));
      const items = await Promise.all(
        createdItems.map(async (item) => ({
          barcode: item.barcode,
          qrDataUrl: await QRCode.toDataURL(item.barcode, {
            width: 300,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
          }),
        }))
      );
      setPending((prev) => [...createdItems, ...prev]);
      pendingBarcodes.current = items.map((item) => item.barcode);
      setStickers(items);
      setPrintFrameHtml(buildPrintHtml(items));
      setPrintState('confirm');
    } catch {
      setError('Network error');
      setPrintState('idle');
    }
  }

  async function savePrintedBarcodes(barcodes: string[]) {
    try {
      const res = await fetch(`/api/products/${productId}/components/bulk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcodes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to save printed barcodes');
        setPrintState('confirm');
        return;
      }
      const nowIso = new Date().toISOString();
      const confirmed = barcodes.map((bc) => {
        const match = pending.find((item) => item.barcode === bc);
        return {
          id: match?.id ?? bc,
          barcode: bc,
          createdAt: match?.createdAt ?? nowIso,
          printedAt: nowIso,
        };
      });
      setHistory((h) => [...confirmed, ...h]);
      setPending((p) => p.filter((item) => !barcodes.includes(item.barcode)));
      setLastConfirmedCount(barcodes.length);
      pendingBarcodes.current = pendingBarcodes.current.filter((bc) => !barcodes.includes(bc));
      setStickers([]);
      setPrintFrameHtml('');
      return true;
    } catch {
      setError('Failed to confirm print status');
      setPrintState('confirm');
      return false;
    }
  }

  async function confirmPrinted() {
    const ok = await savePrintedBarcodes(pendingBarcodes.current);
    if (!ok) return;
    setPrintState('confirmed');
    setTimeout(() => { setPrintState('idle'); setTab('history'); }, 2000);
  }

  async function confirmPendingBarcode(barcodes: string[]) {
    const ok = await savePrintedBarcodes(barcodes);
    if (!ok) return;
    setPrintState('confirmed');
    setTimeout(() => { setPrintState('idle'); setTab('history'); }, 1200);
  }

  function reprint() {
    setPrintState('confirm');
    setPrintFrameHtml(buildPrintHtml(stickers));
  }

  return (
    <div className="print-root min-h-dvh p-4" style={{ fontFamily: 'var(--font-poppins, sans-serif)' }}>

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
          onClick={() => setTab('pending')}
          className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          style={{
            background: tab === 'pending' ? 'rgba(245,158,11,0.12)' : 'transparent',
            color: tab === 'pending' ? '#fbbf24' : '#71717a',
            border: tab === 'pending' ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
          }}
        >
          Pending
          {pending.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24' }}>
              {pending.length}
            </span>
          )}
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
                <button onClick={confirmPrinted} className="btn-primary px-4 py-2 text-sm rounded-lg flex items-center">
                  <Check className="w-4 h-4 mr-1" /> Yes, printed
                </button>
                <button onClick={reprint} style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
                  ↺ Reprint
                </button>
              </div>
            </div>
          )}

          {printState === 'confirmed' && (
            <div className="mb-4 rounded-lg p-3 text-sm font-semibold flex items-center" style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#4ade80' }}>
              <Check className="w-4 h-4 mr-1 inline" /> Saved {lastConfirmedCount} barcode{lastConfirmedCount !== 1 ? 's' : ''} to history
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
                  onWheel={(e) => e.currentTarget.blur()}
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
            {pending.length > 0 && <span className="text-amber-400 font-semibold">{pending.length} pending</span>}
          </div>
        </div>
      )}

      {/* Pending tab */}
      {tab === 'pending' && (
        <div className="no-print card max-w-lg mx-auto mb-4 p-4">
          {pending.length === 0 ? (
            <div className="text-center text-zinc-600 text-sm py-8">No pending barcodes</div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-zinc-300 font-semibold text-sm">{pending.length} barcode{pending.length !== 1 ? 's' : ''} pending</div>
                  <div className="text-zinc-500 text-xs">Generated but not yet saved to printed history</div>
                </div>
                <button
                  onClick={() => confirmPendingBarcode(pending.map((item) => item.barcode))}
                  className="btn-primary px-3 py-2 text-xs rounded-lg"
                >
                  Save All
                </button>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {pending.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
                    <div className="min-w-0">
                      <div className="text-sm font-mono text-zinc-100 truncate">{item.barcode}</div>
                      <div className="text-xs text-zinc-500">Generated {formatStamp(item.createdAt)}</div>
                    </div>
                    <button
                      onClick={() => confirmPendingBarcode([item.barcode])}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.25)', color: '#4ade80' }}
                    >
                      Save
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
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
                      {formatStamp(h.printedAt)}
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
              {stickers.map((sticker, i) => (
                <div key={i} className="sticker">
                  <div className="sticker-inner">
                    <div className="sticker-qr">
                      <img src={sticker.qrDataUrl} alt={sticker.barcode} />
                    </div>
                    <div className="sticker-text">
                      <div className="sticker-name">{name}</div>
                      {partNumber && <div className="sticker-part">{partNumber}</div>}
                      <div className="sticker-barcode">{sticker.barcode}</div>
                      <div className="sticker-meta">{productCode} · {STAGE_LABELS[stage] ?? stage}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {printFrameHtml && (
        <iframe
          title="Component label print frame"
          srcDoc={printFrameHtml}
          style={{ position: 'fixed', width: 0, height: 0, border: 0, opacity: 0, pointerEvents: 'none' }}
        />
      )}

    </div>
  );
}
