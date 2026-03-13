'use client';

import { useEffect, useMemo, useState } from 'react';
import { Barcode128 } from '@/components/Barcode128';

const MONTH_CODES = ['JA', 'FE', 'MR', 'AP', 'MY', 'JN', 'JL', 'AU', 'SE', 'OC', 'NO', 'DE'] as const;

type Tab = 'print' | 'pending' | 'history';
type PrintState = 'idle' | 'generating' | 'confirm' | 'confirmed';
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
};

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
  clients,
  initialPending,
  initialHistory,
}: {
  initialProductCode: string;
  initialProductName: string;
  clients: ClientOption[];
  initialPending: ManualBatch[];
  initialHistory: ManualBatch[];
}) {
  const [tab, setTab] = useState<Tab>('print');
  const [printState, setPrintState] = useState<PrintState>('idle');
  const [productCode, setProductCode] = useState(initialProductCode.toUpperCase());
  const [productName, setProductName] = useState(initialProductName);
  const [startSequence, setStartSequence] = useState('001');
  const [qty, setQty] = useState(1);
  const [copies, setCopies] = useState(1);
  const [clientId, setClientId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [manualPrefix, setManualPrefix] = useState('');
  const [stickers, setStickers] = useState<PrintableSticker[]>([]);
  const [pending, setPending] = useState<ManualBatch[]>(initialPending);
  const [history, setHistory] = useState<ManualBatch[]>(initialHistory);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [lastSavedCount, setLastSavedCount] = useState(0);

  const computedPrefix = useMemo(() => {
    const code = productCode.trim().toUpperCase();
    if (!code) return '';
    return `${code}${currentYear2()}${currentMonthCode()}`;
  }, [productCode]);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === clientId) ?? null,
    [clientId, clients]
  );

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
    const timer = setTimeout(() => {
      if (stickers.length > 0) window.print();
    }, 150);
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

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate manual labels');
      }

      const batch = data.batch as ManualBatch;
      setPending((prev) => [batch, ...prev]);
      setActiveBatchId(batch.id);
      setStickers(buildPrintable(batch.items));
      setPrintState('confirm');
      setTab('print');
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
        body: JSON.stringify({ batchIds }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save barcodes');
      }

      const confirmed = (data.batches as ManualBatch[]) ?? [];
      setPending((prev) => prev.filter((batch) => !batchIds.includes(batch.id)));
      setHistory((prev) => [...confirmed, ...prev]);

      const confirmedCount = confirmed.reduce((sum, batch) => sum + batch.items.length, 0);
      setLastSavedCount(confirmedCount);

      if (activeBatchId && batchIds.includes(activeBatchId)) {
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

  function reprintBatch(batch: ManualBatch) {
    setError('');
    setActiveBatchId(batch.id);
    setStickers(buildPrintable(batch.items));
    setPrintState('confirm');
    setTab('print');
  }

  async function confirmPrinted() {
    if (!activeBatchId) {
      setError('No pending batch selected to save.');
      return;
    }
    await savePendingBatches([activeBatchId]);
  }

  const activeBatch = activeBatchId ? pending.find((batch) => batch.id === activeBatchId) ?? null : null;

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
                Generate controller final stickers, then save or reprint them before they move to history.
              </p>
            </div>

            {printState === 'confirm' && activeBatch && (
              <div
                className="rounded-xl p-3 space-y-3"
                style={{ background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.28)' }}
              >
                <div className="text-sm font-semibold text-amber-300">Did the stickers print successfully?</div>
                <div className="text-xs text-zinc-300">
                  {activeBatch.partyName} · {activeBatch.items.length} serial{activeBatch.items.length !== 1 ? 's' : ''} · {totalStickerCount(activeBatch.items)} sticker{totalStickerCount(activeBatch.items) !== 1 ? 's' : ''}
                </div>
                <div className="flex gap-2">
                  <button onClick={confirmPrinted} className="btn-primary px-4 py-2 text-sm rounded-lg" disabled={saving}>
                    ✓ Save Barcode
                  </button>
                  <button
                    onClick={() => reprintBatch(activeBatch)}
                    disabled={saving}
                    className="px-4 py-2 text-sm rounded-lg text-white"
                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                  >
                    ↺ Reprint
                  </button>
                </div>
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
                onClick={() => setTab('pending')}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${tab === 'pending' ? 'text-amber-300' : 'text-zinc-500 hover:text-zinc-300'}`}
                style={tab === 'pending' ? { borderBottom: '2px solid #f59e0b', marginBottom: -1 } : {}}
              >
                Pending {pending.length > 0 ? pending.length : ''}
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
              {tab === 'print' && (
                <div className="text-sm text-zinc-500">
                  {stickers.length === 0
                    ? 'Generate stickers, then save them after print confirmation.'
                    : `${stickers.length} sticker${stickers.length !== 1 ? 's' : ''} ready · ${pending.length} pending batch${pending.length !== 1 ? 'es' : ''}`}
                </div>
              )}

              {tab === 'pending' &&
                (pending.length === 0 ? (
                  <div className="text-sm text-zinc-500">No abandoned barcodes right now.</div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-zinc-500">Generated but not saved to history yet.</div>
                      <button
                        type="button"
                        onClick={() => savePendingBatches(pending.map((batch) => batch.id))}
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

                        <div className="mt-3 space-y-2">
                          {batch.items.map((item) => (
                            <div key={`${batch.id}-${item.serial}`} className="text-sm font-mono text-zinc-200">
                              {item.serial}
                              {item.copies > 1 && <span className="ml-2 text-xs text-zinc-500">x{item.copies}</span>}
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => savePendingBatches([batch.id])}
                            disabled={saving}
                            className="px-3 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.25)', color: '#4ade80' }}
                          >
                            Save Barcode
                          </button>
                          <button
                            type="button"
                            onClick={() => reprintBatch(batch)}
                            disabled={saving}
                            className="px-3 py-2 rounded-lg text-xs font-semibold text-white"
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
                          >
                            Reprint
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

              {tab === 'history' &&
                (history.length === 0 ? (
                  <div className="text-sm text-zinc-500">No saved manual stickers yet.</div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {history.map((batch) => (
                      <div
                        key={batch.id}
                        className="rounded-xl px-3 py-3"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">{batch.partyName}</div>
                            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-zinc-500">
                              {batch.partyCode && <span className="font-mono text-zinc-300">{batch.partyCode}</span>}
                              <span>{stageLabel(batch.stage)}</span>
                              <span>Saved {formatStamp(batch.confirmedAt ?? batch.createdAt)}</span>
                            </div>
                          </div>
                          <div className="text-[11px] font-semibold text-sky-400">
                            {batch.items.length} serial{batch.items.length !== 1 ? 's' : ''}
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          {batch.items.map((item) => (
                            <div key={`${batch.id}-${item.serial}`} className="text-sm font-mono text-zinc-200">
                              {item.serial}
                              {item.copies > 1 && <span className="ml-2 text-xs text-zinc-500">x{item.copies}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        </div>

        {tab === 'print' && (
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
                        gap: '0.7mm',
                        background: '#fff',
                        color: '#111',
                        fontFamily: 'var(--font-poppins, sans-serif)',
                        padding: '1.2mm 1.6mm',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          fontSize: '2.6mm',
                          fontWeight: 800,
                          fontFamily: 'var(--font-poppins, sans-serif)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03mm',
                          lineHeight: 0.98,
                          textAlign: 'center',
                        }}
                      >
                        NOTE: Warranty Void If Removed
                      </div>
                      <div
                        style={{
                          fontSize: '1.85mm',
                          fontWeight: 900,
                          textTransform: 'uppercase',
                          letterSpacing: '0.18mm',
                          color: '#444',
                        }}
                      >
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
                      <div
                        style={{
                          fontSize: '4.25mm',
                          fontWeight: 900,
                          fontFamily: 'var(--font-poppins, sans-serif)',
                          letterSpacing: '0.02mm',
                          lineHeight: 1,
                          textTransform: 'uppercase',
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
