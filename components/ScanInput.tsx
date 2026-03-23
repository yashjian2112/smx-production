'use client';

import { useRef, useState } from 'react';
import { BarcodeScanner } from './BarcodeScanner';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onScan: (code: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  scannerTitle?: string;
  scannerHint?: string;
  disabled?: boolean;
}

/**
 * Universal scan input — works with both:
 *  • USB / Bluetooth barcode reader (types fast + Enter)
 *  • Phone camera (📷 button opens BarcodeScanner fullscreen)
 */
export function ScanInput({
  value, onChange, onScan,
  placeholder = 'Scan barcode…',
  className = '',
  autoFocus = false,
  scannerTitle = 'Scan Barcode',
  scannerHint,
  disabled = false,
}: Props) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = value.trim();
      if (val) { onScan(val); onChange(''); }
    }
  }

  function handleCameraScan(code: string) {
    setCameraOpen(false);
    onScan(code);
    // Re-focus input after camera closes
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 outline-none font-mono min-w-0"
        />
        {/* Camera button */}
        <button
          type="button"
          onClick={() => setCameraOpen(true)}
          disabled={disabled}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-sky-400 transition-colors disabled:opacity-40"
          style={{ background: 'rgba(255,255,255,0.06)' }}
          title="Scan with camera"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        </button>
      </div>

      {cameraOpen && (
        <BarcodeScanner
          title={scannerTitle}
          hint={scannerHint}
          onScan={handleCameraScan}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  );
}
