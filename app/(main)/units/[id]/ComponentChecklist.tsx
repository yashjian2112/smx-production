'use client';

import { useState, useRef } from 'react';
import { QRCodeCanvas } from '@/components/QRCode';

type Component = {
  id: string;
  name: string;
  partNumber: string | null;
  barcode: string | null;
  stage: string | null;
  required: boolean;
};

type Check = {
  componentId: string;
  checked: boolean;
  scannedValue: string | null;
  checker: { name: string } | null;
  checkedAt: string | null;
};

const STAGE_LABELS: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage',
  BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY: 'Assembly',
  QC_AND_SOFTWARE: 'QC',
  REWORK: 'Rework',
  FINAL_ASSEMBLY: 'Final',
};

export function ComponentChecklist({
  unitId,
  currentStage,
  components,
  initialChecks,
}: {
  unitId: string;
  currentStage: string;
  components: Component[];
  initialChecks: Check[];
}) {
  const [checks, setChecks] = useState<Record<string, Check>>(() => {
    const map: Record<string, Check> = {};
    for (const c of initialChecks) map[c.componentId] = c;
    return map;
  });
  const [scanInput, setScanInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  if (components.length === 0) return null;

  async function toggle(component: Component) {
    const current = checks[component.id];
    const next = !current?.checked;
    const res = await fetch(`/api/units/${unitId}/component-checks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        componentId: component.id,
        stage: currentStage,
        checked: next,
        scannedValue: current?.scannedValue ?? null,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setChecks((prev) => ({ ...prev, [component.id]: data }));
    }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const val = scanInput.trim();
    if (!val) return;
    setScanning(true);
    setScanMsg('');

    const matched = components.find(
      (c) => c.barcode === val || c.partNumber === val || c.name.toLowerCase() === val.toLowerCase()
    );

    if (!matched) {
      setScanMsg(`No component matched "${val}"`);
      setScanning(false);
      return;
    }

    const res = await fetch(`/api/units/${unitId}/component-checks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        componentId: matched.id,
        stage: currentStage,
        checked: true,
        scannedValue: val,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setChecks((prev) => ({ ...prev, [matched.id]: data }));
      setScanMsg(`✓ Matched: ${matched.name}`);
    } else {
      setScanMsg('Failed to save check');
    }

    setScanInput('');
    setScanning(false);
    inputRef.current?.focus();
  }

  const checkedCount = components.filter((c) => checks[c.id]?.checked).length;

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-sm">Component Checklist</h3>
        <span className="text-xs text-zinc-500">{checkedCount}/{components.length} verified</span>
      </div>

      {/* Scan input */}
      <form onSubmit={handleScan} className="flex gap-2">
        <input
          ref={inputRef}
          value={scanInput}
          onChange={(e) => setScanInput(e.target.value)}
          placeholder="Scan barcode / part number…"
          className="input-field text-sm flex-1"
          autoComplete="off"
        />
        <button type="submit" disabled={scanning} className="btn-primary px-4 text-sm">
          {scanning ? '…' : 'Scan'}
        </button>
      </form>
      {scanMsg && (
        <p className={`text-xs ${scanMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{scanMsg}</p>
      )}

      {/* Component list */}
      <div className="space-y-2">
        {components.map((c) => {
          const check = checks[c.id];
          const done = check?.checked;
          return (
            <div
              key={c.id}
              className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
                done
                  ? 'bg-green-500/5 border border-green-500/15'
                  : 'border border-zinc-800/60'
              }`}
            >
              {(c.barcode || c.partNumber) && (
                <QRCodeCanvas
                  value={c.barcode || c.partNumber || ''}
                  size={48}
                  dark={done ? '#4ade80' : '#94a3b8'}
                  light="transparent"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium ${done ? 'text-green-400' : 'text-white'}`}>{c.name}</span>
                  {c.partNumber && <span className="font-mono text-xs text-zinc-600">{c.partNumber}</span>}
                  {c.stage && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      {STAGE_LABELS[c.stage] ?? c.stage}
                    </span>
                  )}
                  {c.required && !done && <span className="text-[10px] text-amber-400">required</span>}
                </div>
                {done && check.checker && (
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {check.scannedValue ? `Scanned: ${check.scannedValue} · ` : ''}
                    {check.checker.name} · {check.checkedAt ? new Date(check.checkedAt).toLocaleString() : ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => toggle(c)}
                className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  done
                    ? 'bg-green-500 border-green-500 text-white'
                    : 'border-zinc-700 hover:border-sky-500'
                }`}
              >
                {done && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
