'use client';

import { useRef, useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { BarcodeScanner } from '@/components/BarcodeScanner';
import type { HarnessUnit } from './types';

/**
 * QC Scan Verification Step — SCANNER ONLY
 *
 * CRITICAL: No manual text entry allowed. Users must physically scan the barcode.
 * USB/Bluetooth scanners work via a hidden auto-focused input that captures fast keystrokes.
 * Phone users can tap the camera button to scan.
 */
export function QCScanStep({
  onVerified,
  onCancel,
  title,
}: {
  onVerified: (val: string) => void;
  onCancel: () => void;
  title?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [buffer, setBuffer] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep hidden input focused so USB scanner input is captured
  useEffect(() => {
    inputRef.current?.focus();
    const interval = setInterval(() => {
      if (!cameraOpen) inputRef.current?.focus();
    }, 500);
    return () => clearInterval(interval);
  }, [cameraOpen]);

  // USB scanner types fast + Enter. Detect Enter to submit.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = buffer.trim();
      if (val) {
        onVerified(val.toUpperCase());
        setBuffer('');
      }
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setBuffer(e.target.value);
    // Auto-clear if no Enter within 2s (stale partial scan)
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setBuffer(''), 2000);
  }

  function handleCameraScan(code: string) {
    setCameraOpen(false);
    onVerified(code.trim().toUpperCase());
  }

  return (
    <div className="mt-3 p-4 rounded-xl bg-zinc-900/80 border border-purple-500/30 space-y-3">
      <div className="flex items-center gap-2">
        <ScanLine className="w-4 h-4 text-purple-400" />
        <p className="text-sm font-medium text-purple-300">{title || 'Scan Harness Barcode'}</p>
      </div>
      <p className="text-xs text-slate-400">
        Use a barcode scanner or tap the camera button to scan the harness label.
      </p>

      {/* Hidden input for USB/Bluetooth scanner — captures fast keystrokes */}
      <input
        ref={inputRef}
        type="text"
        value={buffer}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        style={{ position: 'absolute', left: '-9999px', opacity: 0, width: '1px', height: '1px' }}
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Visual scan area */}
      <div className="flex items-center justify-center gap-4 py-4 rounded-lg border border-dashed border-slate-600">
        <div className="flex flex-col items-center gap-2">
          <ScanLine className="w-8 h-8 text-purple-400/60 animate-pulse" />
          <span className="text-xs text-slate-500">Waiting for scanner...</span>
        </div>
        <div className="h-8 w-px bg-slate-700" />
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600/15 text-purple-300 border border-purple-500/30 text-xs font-medium hover:bg-purple-600/25 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Camera Scan
        </button>
      </div>

      <div className="flex justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-xs font-medium hover:bg-slate-600 transition-colors"
        >
          Cancel
        </button>
      </div>

      {cameraOpen && (
        <BarcodeScanner
          title="Scan Harness"
          hint="Point at the harness barcode label"
          onScan={handleCameraScan}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Validates scanned value against unit barcode/serial.
 * Called by the parent after QCScanStep returns the raw scanned value.
 * Keeps validation logic separate from UI to prevent leaking unit data into the component.
 */
export function validateQCScan(unit: HarnessUnit, scannedValue: string): boolean {
  const val = scannedValue.trim().toUpperCase();
  const barcodeMatch = unit.barcode && val === unit.barcode.toUpperCase();
  const serialMatch = unit.serialNumber && val === unit.serialNumber.toUpperCase();
  return !!(barcodeMatch || serialMatch);
}
