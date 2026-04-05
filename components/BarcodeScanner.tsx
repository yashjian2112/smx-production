'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type Props = {
  title?: string;
  hint?: string;
  onScan: (code: string) => void;
  onClose: () => void;
};

export function BarcodeScanner({ title = 'Scan Barcode', hint, onScan, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [barcodeApiSupported, setBarcodeApiSupported] = useState(false);
  const didScan = useRef(false);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const handleScanResult = useCallback(
    (code: string) => {
      if (didScan.current) return;
      didScan.current = true;
      stopCamera();
      onScan(code.trim().toUpperCase());
    },
    [stopCamera, onScan]
  );

  useEffect(() => {
    const hasBarcodeDetector = 'BarcodeDetector' in window;
    setBarcodeApiSupported(hasBarcodeDetector);

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setCameraError('Camera access denied. Please allow camera access to scan barcodes.');
      }
    }

    startCamera();
    return () => stopCamera();
  }, [stopCamera]);

  // Start BarcodeDetector scanning loop when video is playing
  const startScanLoop = useCallback(async () => {
    if (!('BarcodeDetector' in window) || !videoRef.current) return;
    setCameraReady(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const detector = new (window as any).BarcodeDetector({
      formats: ['code_128', 'code_39', 'code_93', 'qr_code', 'ean_13', 'ean_8', 'data_matrix', 'itf'],
    });

    async function loop() {
      if (!videoRef.current || didScan.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          handleScanResult(codes[0].rawValue);
          return;
        }
      } catch {
        // detector not ready yet, retry
      }
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [handleScanResult]);

  function handleClose() {
    stopCamera();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 pt-safe-top"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: 12 }}
      >
        <div>
          <h3 className="text-white font-semibold text-base">{title}</h3>
          {hint && <p className="text-zinc-400 text-xs mt-0.5">{hint}</p>}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative overflow-hidden bg-zinc-950">
        {cameraError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.6)" strokeWidth="1.5" strokeLinecap="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <p className="text-zinc-400 text-sm text-center">{cameraError}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              muted
              playsInline
              autoPlay
              onPlaying={startScanLoop}
            />

            {/* Scan overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {/* Dark edges */}
              <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.45)' }} />
              {/* Transparent scan window */}
              <div
                className="relative w-72 h-48 rounded-2xl"
                style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)', background: 'transparent' }}
              >
                {/* Corner brackets */}
                {[
                  'top-0 left-0 border-t-2 border-l-2 rounded-tl-xl',
                  'top-0 right-0 border-t-2 border-r-2 rounded-tr-xl',
                  'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl',
                  'bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl',
                ].map((cls, i) => (
                  <div key={i} className={`absolute w-8 h-8 border-sky-400 ${cls}`} />
                ))}
                {/* Scan line animation */}
                <div
                  className="absolute left-2 right-2 h-0.5 rounded-full"
                  style={{
                    background: 'linear-gradient(90deg,transparent,#38bdf8,transparent)',
                    animation: 'scanline 2s ease-in-out infinite',
                    top: '50%',
                  }}
                />
              </div>
            </div>

            {/* Status */}
            <div className="absolute bottom-0 left-0 right-0 pb-4 flex justify-center pointer-events-none">
              {cameraReady && barcodeApiSupported ? (
                <div
                  className="flex items-center gap-2 px-4 py-2 rounded-full text-xs text-sky-400 font-medium"
                  style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.2)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                  Scanning…
                </div>
              ) : !cameraReady && !cameraError ? (
                <div className="text-zinc-500 text-xs">Starting camera…</div>
              ) : !barcodeApiSupported ? (
                <div className="text-amber-400 text-xs text-center px-6">
                  Auto-scan not supported on this browser
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>


      {/* Scan line keyframe */}
      <style>{`
        @keyframes scanline {
          0%   { top: 10%; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
