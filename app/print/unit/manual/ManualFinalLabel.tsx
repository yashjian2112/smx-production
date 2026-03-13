'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Barcode128 } from '@/components/Barcode128';

const MONTH_CODES = ['JA', 'FE', 'MR', 'AP', 'MY', 'JN', 'JL', 'AU', 'SE', 'OC', 'NO', 'DE'] as const;

type Tab = 'print' | 'pending' | 'history';
type PrintState = 'idle' | 'generating' | 'confirm' | 'confirmed';
type BatchStatus = 'PENDING' | 'CONFIRMED' | 'ABANDONED';
type GeneratedSerial = { serial: string; copies: number };
type PrintableSticker = { serial: string };
type ClientOption = { id: string; code: string; customerName: string };
type ManualBatch = {
  id: string;
  partyName: string;
  partyCode: string | null;
  stage: string;
  createdAt: string;
  confirmedAt: string | null;
  items: GeneratedSerial[];
  status: BatchStatus;
};

function padSequence(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  return digits.padStart(3, '0');
}

function currentYear2() {
  return String(new Date().getFullYear() % 100).padStart(2, '0');
}

function currentMonthCode() {
  return MONTH_CODES[new Date().getMonth()] ?? 'JA';
}

function formatStamp(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stageLabel(stage: string) {
  return stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildPrintable(items: GeneratedSerial[]) {
  return items.flatMap((item) => Array.from({ length: item.copies }, () => ({ serial: item.serial })));
}

function totalStickerCount(items: GeneratedSerial[]) {
  return items.reduce((sum, item) => sum + item.copies, 0);
}

export function ManualFinalLabel({
  initialProductCode,
  initialProductName,
  initialNextSequence,
  clients,
  initialPending,
  initialHistory,
}: {
  initialProductCode: string;
  initialProductName: string;
  initialNextSequence?: number;
  clients: ClientOption[];
  initialPending: ManualBatch[];
  initialHistory: ManualBatch[];
}) {
  const [tab, setTab]             = useState<Tab>('print');
  const [printState, setPrintState] = useState<PrintState>('idle');
  const [productCode, setProductCode] = useState(initialProductCode.toUpperCase());
  const [productName, setProductName] = useState(initialProductName);
  const [startSequence, setStartSequence] = useState(
    String(initialNextSequence ?? 1).padStart(3, '0')
  );
  const [qty, setQty]       = useState(1);
  const [copies, setCopies] = useState(1);
  const [clientId, setClientId]   = useState('');
  const [partyName, setPartyName] = useState('');
  const [manualPrefix, setManualPrefix] = useState('');
  const [stickers, setStickers]   = useState<PrintableSticker[]>([]);
  const [pending, setPending]     = useState<ManualBatch[]>(initialPending);
  const [history, setHistory]     = useState<ManualBatch[]>(initialHistory);
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [lastSavedCount, setLastSavedCount] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fetchSeqTimeout  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmBoxRef    = useRef<HTMLDivElement | null>(null);
  const isInitialMount   = useRef(true);

  const computedPrefix = useMemo(() => {
    const code = productCode.trim().toUpperCase();
    if (!code) return '';
    return `${code}${currentYear2()}${currentMonthCode()}`;
  }, [productCode]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId) ?? null,
    [clientId, clients]
  );

  // Auto-fetch next sequence when productCode changes (debounced 600ms).
  // Skip on initial mount — the server already computed the correct initialNextSequence.
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const code = productCode.trim().toUpperCase();
    if (!code || manualPrefix.trim()) return;
    if (fetchSeqTimeout.current) clearTimeout(fetchSeqTimeout.current);
    fetchSeqTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/print/unit/manual?productCode=${encodeURIComponent(code)}`);
        if (!res.ok) return;
        const data = await res.json() as { nextSequence?: number };
        if (typeof data.nextSequence === 'number' && data.nextSequence > 0) {
          setStartSequence(String(data.nextSequence).padStart(3, '0'));
        }
      } catch {
        // silently ignore fetch errors
      }
    }, 600);
    return () => {
      if (fetchSeqTimeout.current) clearTimeout(fetchSeqTimeout.current);
    };
  }, [productCode, manualPrefix]);

  // Inject print styles and auto-trigger print when stickers are set
  useEffect(() => {
    if (stickers.length === 0) return;
    const style = document.createElement('style');
    style.textContent = `
      @media print {
        * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          outline: none !important;
          -webkit-tap-highlight-color: transparent;
        }
        @page { margin: 0; size: 50mm 25mm; }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: 50mm !important;
          background: white !important;
        }
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
          border: none;
          outline: none;
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
        .sticker-inner {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
        }
      }
    `;
    document.head.appendChild(style);
    const timer = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(timer);
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

  async function generateAndPrint() {
    const generated = buildSerials();
    const resolvedPartyName = partyName.trim() || selectedClient?.customerName || '';
    const resolvedPrefix = (manualPrefix.trim().toUpperCase() || computedPrefix).trim();

    if (!resolvedPrefix) {
      setStickers([]);
      setError('Enter a valid prefix before printing.');
      return;
    }
    if (!resolvedPartyName) {
      setStickers([]);
      setError('Select a party or enter a party name before printing.');
      return;
    }

    setError('');
    setSaving(true);
    setPrintState('generating');

    try {
      const res = await fetch('/api/print/unit/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: 'FINAL_ASSEMBLY',
          clientId: clientId || undefined,
          partyName: resolvedPartyName,
          productCode: productCode.trim().toUpperCase(),
          productName: productName.trim(),
          prefix: resolvedPrefix,
          items: generated,
        }),
      });

      const data = await res.json() as { error?: string; batch?: ManualBatch };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate manual labels');
      }

      const batch = data.batch as ManualBatch;
      setPending((prev) => [batch, ...prev]);
      setActiveBatchId(batch.id);
      setStickers(buildPrintable(batch.items));
      setPrintState('confirm');
      setTab('print');
      setTimeout(() => confirmBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    } catch (err) {
      console.error(err);
      setStickers([]);
      setPrintState('idle');
      setError(err instanceof Error ? err.message : 'Failed to generate manual labels');
    } finally {
      setSaving(false);
    }
  }

  async function savePendingBatches(batchIds: string[]) {
    if (batchIds.length === 0) return false;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/print/unit/manual', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchIds, action: 'confirm' }),
      });
      const data = await res.json() as { error?: string; batches?: ManualBatch[] };
      if (!res.ok) throw new Error(data.error || 'Failed to save barcodes');

      const confirmed = data.batches ?? [];
      const confirmedIds = new Set(confirmed.map((b) => b.id));
      setPending((prev) => prev.filter((b) => !confirmedIds.has(b.id)));
      setHistory((prev) => [...confirmed, ...prev]);

      const confirmedCount = confirmed.reduce((sum, b) => sum + b.items.length, 0);
      setLastSavedCount(confirmedCount);

      if (activeBatchId && confirmedIds.has(activeBatchId)) {
        setActiveBatchId(null);
        setStickers([]);
      }

      setPrintState('confirmed');
      setTimeout(() => {
        setPrintState('idle');
        setTab('history');
      }, 1400);
      return true;
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to save barcodes');
      setPrintState('confirm');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function abandonBatch(batchId: string) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/print/unit/manual', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchIds: [batchId], action: 'abandon' }),
      });
      const data = await res.json() as { error?: string; batches?: ManualBatch[] };
      if (!res.ok) throw new Error(data.error || 'Failed to abandon batch');

      const abandoned = data.batches ?? [];
      const abandonedIds = new Set(abandoned.map((b) => b.id));
      setPending((prev) => prev.filter((b) => !abandonedIds.has(b.id)));
      setHistory((prev) => [...abandoned, ...prev]);

      if (activeBatchId && abandonedIds.has(activeBatchId)) {
        setActiveBatchId(null);
        setStickers([]);
      }
      setPrintState('idle');
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to abandon batch');
      setPrintState('confirm');
    } finally {
      setSaving(false);
    }
  }

  function reprintBatch(batch: ManualBatch) {
    setError('');
    setActiveBatchId(batch.id);
    setStickers(buildPrintable(batch.items));
    setPrintState('confirm');
    setTab('print');
    // scroll confirm box into view after state settles
    setTimeout(() => confirmBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  const removeBatch = useCallback(async (batchId: string) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/print/unit/manual', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchIds: [batchId] }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to remove batch');
      setHistory((prev) => prev.filter((b) => b.id !== batchId));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setSaving(false);
    }
  }, []);

  async function confirmPrinted() {
    if (!activeBatchId) {
      setError('No pending batch selected to save.');
      return;
    }
    await savePendingBatches([activeBatchId]);
  }

  const activeBatch = activeBatchId ? pending.find((b) => b.id === activeBatchId) ?? null : null;

  return (
    <div className="print-root min-h-dvh p-4" style={{ fontFamily: 'var(--font-poppins, sans-serif)' }}>
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[340px_1fr] gap-4">
        {/* ── Left sidebar (controls) ── */}
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
                Generate controller final stickers, then save or reprint them before they move to history.
              </p>
            </div>

            {/* ── Print confirmation box ── */}
            {printState === 'confirm' && activeBatch && (
              <div
                ref={confirmBoxRef}
                className="rounded-xl p-3 space-y-3"
                style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.28)' }}
              >
                <div className="text-sm font-semibold text-amber-300">Did the stickers print successfully?</div>
                <div className="text-xs text-zinc-300">
                  {activeBatch.partyName} · {activeBatch.items.length} serial{activeBatch.items.length !== 1 ? 's' : ''} · {totalStickerCount(activeBatch.items)} sticker{totalStickerCount(activeBatch.items) !== 1 ? 's' : ''}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={confirmPrinted}
                    className="btn-primary px-4 py-2 text-sm rounded-lg"
                    disabled={saving}
                  >
                    ✓ Yes — Save Barcode
                  </button>
                  <button
                    onClick={() => reprintBatch(activeBatch)}
                    disabled={saving}
                    className="px-4 py-2 text-sm rounded-lg text-white"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                  >
                    ↺ Reprint
                  </button>
                  <button
                    onClick={() => abandonBatch(activeBatch.id)}
                    disabled={saving}
                    className="px-4 py-2 text-sm rounded-lg"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
                  >
                    ✕ Abandon
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Abandon keeps this batch in history as Cancelled.
                </p>
              </div>
            )}

            {printState === 'confirmed' && (
              <div
                className="rounded-xl p-3 text-sm font-semibold"
                style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.28)', color: '#4ade80' }}
              >
                ✓ Saved {lastSavedCount} serial{lastSavedCount !== 1 ? 's' : ''} to history
              </div>
            )}

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

              <div
                className="space-y-3 rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Party</label>
                  <select
                    value={clientId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setClientId(nextId);
                      const client = clients.find((item) => item.id === nextId);
                      setPartyName(client?.customerName ?? '');
                    }}
                    className="input-field text-sm"
                  >
                    <option value="">Manual party entry</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.customerName} ({client.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Party Name</label>
                  <input
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    className="input-field text-sm"
                    placeholder="Enter party name"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span>Stage</span>
                  <span className="font-semibold text-amber-300">Final Assembly</span>
                </div>
                {selectedClient && (
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Party Code</span>
                    <span className="font-mono text-zinc-300">{selectedClient.code}</span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Prefix Override</label>
                <input
                  value={manualPrefix}
                  onChange={(e) => setManualPrefix(e.target.value.toUpperCase())}
                  className="input-field text-sm font-mono"
                  placeholder={computedPrefix || 'Auto from product + year + batch'}
                />
                <p className="text-[11px] text-zinc-600 mt-1">
                  Auto prefix: <span className="font-mono text-zinc-400">{computedPrefix || '—'}</span>
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Start Seq</label>
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

              <div
                className="rounded-xl px-3 py-2 text-xs"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <span className="text-sky-400 font-semibold">Qty</span> = new serial numbers
                <span className="text-zinc-600 mx-2">|</span>
                <span className="text-amber-400 font-semibold">Copies</span> = same serial prints multiple times
              </div>
            </div>

            <button
              type="button"
              onClick={generateAndPrint}
              disabled={saving || printState === 'generating'}
              className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: '#0ea5e9', color: '#fff' }}
            >
              {printState === 'generating'
                ? 'Generating...'
                : `Generate & Print ${qty * copies} sticker${qty * copies !== 1 ? 's' : ''}`}
            </button>
            {error && <p className="text-xs text-rose-400">{error}</p>}
          </div>

          {/* ── Tabs: Print / Pending / History ── */}
          <div className="card overflow-hidden">
            <div className="flex border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              {(
                [
                  { key: 'print',   label: 'Print',   color: '#38bdf8' },
                  { key: 'pending', label: `Pending${pending.length > 0 ? ` ${pending.length}` : ''}`, color: '#f59e0b' },
                  { key: 'history', label: `History${history.length > 0 ? ` ${history.length}` : ''}`, color: '#38bdf8' },
                ] as const
              ).map(({ key, label, color }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === key ? '' : 'text-zinc-500 hover:text-zinc-300'}`}
                  style={tab === key ? { color, borderBottom: `2px solid ${color}`, marginBottom: -1 } : {}}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* Print tab info */}
              {tab === 'print' && (
                <div className="text-sm text-zinc-500">
                  {stickers.length === 0
                    ? 'Generate stickers, then save them after print confirmation.'
                    : `${stickers.length} sticker${stickers.length !== 1 ? 's' : ''} ready · ${pending.length} pending batch${pending.length !== 1 ? 'es' : ''}`}
                </div>
              )}

              {/* Pending tab */}
              {tab === 'pending' &&
                (pending.length === 0 ? (
                  <div className="text-sm text-zinc-500">No pending barcodes right now.</div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-zinc-500">Generated but not saved to history yet.</div>
                      <button
                        type="button"
                        onClick={() => savePendingBatches(pending.map((b) => b.id))}
                        disabled={saving}
                        className="px-3 py-2 rounded-lg text-xs font-semibold"
                        style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.25)', color: '#4ade80' }}
                      >
                        Save All
                      </button>
                    </div>

                    {pending.map((batch) => (
                      <div
                        key={batch.id}
                        className="rounded-xl px-3 py-3"
                        style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.14)' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">{batch.partyName}</div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                              {batch.partyCode && <span className="font-mono text-zinc-300">{batch.partyCode}</span>}
                              <span>{stageLabel(batch.stage)}</span>
                              <span>Generated {formatStamp(batch.createdAt)}</span>
                            </div>
                          </div>
                          <div className="text-[11px] font-semibold text-amber-300">
                            {batch.items.length} serial{batch.items.length !== 1 ? 's' : ''}
                          </div>
                        </div>

                        <div className="mt-3 space-y-1">
                          {batch.items.map((item) => (
                            <div key={`${batch.id}-${item.serial}`} className="text-sm font-mono text-zinc-200">
                              {item.serial}
                              {item.copies > 1 && <span className="ml-2 text-xs text-zinc-500">×{item.copies}</span>}
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => savePendingBatches([batch.id])}
                            disabled={saving}
                            className="px-3 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.25)', color: '#4ade80' }}
                          >
                            ✓ Save
                          </button>
                          <button
                            type="button"
                            onClick={() => reprintBatch(batch)}
                            disabled={saving}
                            className="px-3 py-2 rounded-lg text-xs font-semibold text-white"
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                          >
                            ↺ Reprint
                          </button>
                          <button
                            type="button"
                            onClick={() => abandonBatch(batch.id)}
                            disabled={saving}
                            className="px-3 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
                          >
                            ✕ Abandon
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

              {/* History tab */}
              {tab === 'history' &&
                (history.length === 0 ? (
                  <div className="text-sm text-zinc-500">No saved manual stickers yet.</div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {history.map((batch) => {
                      const isAbandoned = batch.status === 'ABANDONED';
                      return (
                        <div
                          key={batch.id}
                          className="rounded-xl px-3 py-3"
                          style={{
                            background: isAbandoned ? 'rgba(239,68,68,0.04)' : 'rgba(255,255,255,0.04)',
                            border: isAbandoned
                              ? '1px solid rgba(239,68,68,0.18)'
                              : '1px solid rgba(255,255,255,0.06)',
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-white">{batch.partyName}</div>
                                {isAbandoned && (
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                    style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}
                                  >
                                    Abandoned / Cancelled
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                                {batch.partyCode && <span className="font-mono text-zinc-300">{batch.partyCode}</span>}
                                <span>{stageLabel(batch.stage)}</span>
                                <span>
                                  {isAbandoned ? 'Abandoned' : 'Saved'}{' '}
                                  {formatStamp(batch.confirmedAt ?? batch.createdAt)}
                                </span>
                              </div>
                            </div>
                            <div
                              className="text-[11px] font-semibold"
                              style={{ color: isAbandoned ? '#f87171' : '#38bdf8' }}
                            >
                              {batch.items.length} serial{batch.items.length !== 1 ? 's' : ''}
                            </div>
                          </div>

                          <div className="mt-3 space-y-1">
                            {batch.items.map((item) => (
                              <div
                                key={`${batch.id}-${item.serial}`}
                                className="text-sm font-mono"
                                style={{ color: isAbandoned ? '#71717a' : '#e4e4e7' }}
                              >
                                {item.serial}
                                {item.copies > 1 && <span className="ml-2 text-xs text-zinc-600">×{item.copies}</span>}
                              </div>
                            ))}
                          </div>

                          {/* History actions */}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => reprintBatch(batch)}
                              disabled={saving}
                              className="px-3 py-2 rounded-lg text-xs font-semibold text-white"
                              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                            >
                              ↺ Reprint
                            </button>

                            {confirmDeleteId === batch.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => removeBatch(batch.id)}
                                  disabled={saving}
                                  className="px-3 py-2 rounded-lg text-xs font-semibold"
                                  style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5' }}
                                >
                                  {saving ? '...' : 'Confirm Remove'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  disabled={saving}
                                  className="px-3 py-2 rounded-lg text-xs font-semibold text-zinc-400"
                                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(batch.id)}
                                disabled={saving}
                                className="px-3 py-2 rounded-lg text-xs font-semibold"
                                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#f87171' }}
                              >
                                ✕ Remove
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* ── Right: sticker preview + print output ── */}
        {tab === 'print' && (
          <div>
            <div className="print-sheet">
              <div className="sticker-grid">
                {stickers.map((sticker, index) => (
                  <div key={`${sticker.serial}-${index}`} className="sticker">
                    <div
                      className="sticker-inner"
                      style={{
                        width: '46mm',
                        height: '21mm',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '0.5mm',
                        background: '#fff',
                        color: '#111',
                        fontFamily: 'Arial, Helvetica, sans-serif',
                        padding: '1mm 1.4mm',
                        border: 'none',
                        outline: 'none',
                      }}
                    >
                      {/* NOTE line */}
                      <div
                        style={{
                          width: '100%',
                          fontSize: '3.2mm',
                          fontWeight: 900,
                          fontFamily: 'Arial, Helvetica, sans-serif',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04mm',
                          lineHeight: 1,
                          textAlign: 'center',
                          color: '#000',
                        }}
                      >
                        NOTE — Warranty Void If Removed
                      </div>

                      {/* "Serial Number" label */}
                      <div
                        style={{
                          fontSize: '2.4mm',
                          fontWeight: 700,
                          fontFamily: 'Arial, Helvetica, sans-serif',
                          textTransform: 'uppercase',
                          letterSpacing: '0.2mm',
                          color: '#333',
                          lineHeight: 1,
                        }}
                      >
                        Serial Number
                      </div>

                      {/* Barcode */}
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        <Barcode128
                          value={sticker.serial}
                          width={1.5}
                          height={20}
                          displayValue={false}
                          fontSize={9}
                          background="#ffffff"
                          lineColor="#000000"
                        />
                      </div>

                      {/* Serial text — largest, most prominent */}
                      <div
                        style={{
                          fontSize: '5.5mm',
                          fontWeight: 900,
                          fontFamily: 'Arial, Helvetica, sans-serif',
                          letterSpacing: '0.1mm',
                          lineHeight: 1,
                          textTransform: 'uppercase',
                          color: '#000',
                        }}
                      >
                        {sticker.serial}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
