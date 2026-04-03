'use client';

import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { ScanInput } from '@/components/ScanInput';
import type { HarnessUnit } from './types';

/**
 * QC Scan Verification Step
 *
 * CRITICAL: This component intentionally HIDES the barcode and serial number.
 * Showing them would let operators copy/paste instead of physically scanning,
 * which defeats the purpose of QC barcode verification.
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
  const [scanVal, setScanVal] = useState('');
  const [error, setError] = useState('');

  function handleScan(val: string) {
    const v = val.trim().toUpperCase();
    if (!v) return;
    setError('');
    onVerified(v);
  }

  return (
    <div className="mt-3 p-4 rounded-xl bg-zinc-900/80 border border-purple-500/30 space-y-3">
      <div className="flex items-center gap-2">
        <ScanLine className="w-4 h-4 text-purple-400" />
        <p className="text-sm font-medium text-purple-300">{title || 'Scan Harness Barcode'}</p>
      </div>
      <p className="text-xs text-slate-400">
        Scan the barcode label on the physical harness unit to verify identity before QC testing.
      </p>
      <ScanInput
        value={scanVal}
        onChange={setScanVal}
        onScan={handleScan}
        placeholder="Scan barcode..."
        autoFocus
        scannerTitle="Scan Harness"
        scannerHint="Point at the harness barcode label"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-xs font-medium hover:bg-slate-600 transition-colors"
        >
          Cancel
        </button>
      </div>
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
