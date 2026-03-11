'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

type Props = {
  /** Blob URL of the captured photo */
  src: string;
  /** Called every time the enhanced blob is regenerated (on filter change or on load) */
  onEnhancedBlob: (blob: Blob) => void;
  /** Minimum height of the image container (default 220) */
  minHeight?: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Unsharp-mask kernel  [0, -1, 0, -1, 5, -1, 0, -1, 0]
// Runs once on the full-resolution canvas when exporting — not on every render.
// ─────────────────────────────────────────────────────────────────────────────
function sharpenImageData(imageData: ImageData): ImageData {
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const { data, width, height } = imageData;
  const output = new ImageData(width, height);
  const out = output.data;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const kidx = ((y + ky) * width + (x + kx)) * 4;
            sum += data[kidx + c] * kernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        out[idx + c] = Math.max(0, Math.min(255, sum));
      }
      out[idx + 3] = data[idx + 3]; // preserve alpha
    }
  }

  // Copy border pixels unchanged
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      const idx = (y * width + x) * 4;
      out[idx] = data[idx]; out[idx+1] = data[idx+1]; out[idx+2] = data[idx+2]; out[idx+3] = data[idx+3];
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      const idx = (y * width + x) * 4;
      out[idx] = data[idx]; out[idx+1] = data[idx+1]; out[idx+2] = data[idx+2]; out[idx+3] = data[idx+3];
    }
  }

  return output;
}

// ─────────────────────────────────────────────────────────────────────────────
export function ImageEnhancer({ src, onEnhancedBlob, minHeight = 220 }: Props) {
  // ── Server-enhanced image (CLAHE + unsharp mask via sharp) ──────────────
  const [enhancedSrc,  setEnhancedSrc]  = useState<string | null>(null);
  const [enhancing,    setEnhancing]    = useState(true);   // true while API call in flight
  const [enhanceFailed, setEnhanceFailed] = useState(false); // fallback if API fails
  const enhancedBlobRef = useRef<Blob | null>(null);        // keep ref for onEnhancedBlob

  // ── Display adjustment (CSS filter on top of server-enhanced image) ──────
  const [contrast,     setContrast]     = useState(1.0);    // 1.0 = no additional change
  const [brightness,   setBrightness]   = useState(1.0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // ── Zoom / pan state ────────────────────────────────────────────────────
  const [zoom,   setZoom]   = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef       = useRef<HTMLImageElement>(null);
  const isDragging   = useRef(false);
  const dragStart    = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pinchRef     = useRef<{ dist: number; startZoom: number } | null>(null);
  const lastTapTime  = useRef(0);
  const lastTapCoord = useRef({ x: 0, y: 0 });

  // ── Auto-call enhance API whenever src changes ───────────────────────────
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    setEnhancing(true);
    setEnhanceFailed(false);
    setEnhancedSrc(null);
    enhancedBlobRef.current = null;

    (async () => {
      try {
        // src is a local blob URL — fetch it as a blob, POST to enhance API
        const rawBlob = await fetch(src).then(r => r.blob());
        const fd = new FormData();
        fd.append('image', rawBlob, 'photo.jpg');
        const res = await fetch('/api/enhance-image', { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`enhance API ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        enhancedBlobRef.current = blob;
        setEnhancedSrc(URL.createObjectURL(blob));
        onEnhancedBlob(blob);  // immediately pass to parent (submit will use this)
      } catch (err) {
        console.warn('Image enhance failed, using original:', err);
        if (cancelled) return;
        setEnhanceFailed(true);
        // Fall back: pass original src blob to parent
        fetch(src).then(r => r.blob()).then(b => { if (!cancelled) onEnhancedBlob(b); }).catch(() => {});
      } finally {
        if (!cancelled) setEnhancing(false);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // ── Zoom-linked auto clarity (CSS on top of server enhancement) ──────────
  const zoomBoost         = Math.log2(Math.max(1, zoom)) * 0.12;
  const effectiveContrast = Math.min(2.5, contrast + zoomBoost);

  // ── The source actually shown in the <img> ───────────────────────────────
  const displaySrc = showOriginal ? src : (enhancedSrc ?? src);

  // ── CSS filter — fine-tuning on top of the server-processed image ────────
  const filterStr = showOriginal
    ? 'none'
    : `contrast(${effectiveContrast.toFixed(3)}) brightness(${brightness})`;

  // ── Clamp offset so image never leaves the viewport ─────────────────────
  const clamp = useCallback((ox: number, oy: number, z: number) => {
    const el = containerRef.current;
    if (!el) return { x: ox, y: oy };
    const W = el.clientWidth, H = el.clientHeight;
    const maxX = (W * (z - 1)) / 2;
    const maxY = (H * (z - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, []);

  // ── Double-tap / double-click zoom ───────────────────────────────────────
  const handleDoubleTap = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (zoom > 1) {
      // Reset
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } else {
      const newZoom = 2.5;
      // Centre the zoom on the tap point
      const tx = clientX - rect.left - rect.width / 2;
      const ty = clientY - rect.top  - rect.height / 2;
      const raw = { x: -tx * (newZoom - 1), y: -ty * (newZoom - 1) };
      setZoom(newZoom);
      setOffset(clamp(raw.x, raw.y, newZoom));
    }
  }, [zoom, clamp]);

  // ── Pointer events (mouse drag + click detection) ────────────────────────
  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'touch') return; // handled via touch events
    isDragging.current = false;
    dragStart.current  = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragStart.current || e.pointerType === 'touch') return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      isDragging.current = true;
      if (zoom > 1) {
        setOffset(clamp(dragStart.current.ox + dx, dragStart.current.oy + dy, zoom));
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (e.pointerType === 'touch') return;
    if (!isDragging.current) {
      // It was a click → check for double-tap
      const now = Date.now();
      if (now - lastTapTime.current < 300) {
        handleDoubleTap(e.clientX, e.clientY);
        lastTapTime.current = 0;
      } else {
        lastTapTime.current  = now;
        lastTapCoord.current = { x: e.clientX, y: e.clientY };
      }
    }
    dragStart.current  = null;
    isDragging.current = false;
  }

  // ── Touch events (pinch + drag) ──────────────────────────────────────────
  function handleTouchStart(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const now = Date.now();
      if (now - lastTapTime.current < 300) {
        handleDoubleTap(t.clientX, t.clientY);
        lastTapTime.current = 0;
      } else {
        lastTapTime.current  = now;
        lastTapCoord.current = { x: t.clientX, y: t.clientY };
      }
      dragStart.current  = { x: t.clientX, y: t.clientY, ox: offset.x, oy: offset.y };
      isDragging.current = false;
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = { dist: Math.sqrt(dx * dx + dy * dy), startZoom: zoom };
      dragStart.current = null;
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1 && dragStart.current && zoom > 1) {
      const t  = e.touches[0];
      const dx = t.clientX - dragStart.current.x;
      const dy = t.clientY - dragStart.current.y;
      isDragging.current = true;
      setOffset(clamp(dragStart.current.ox + dx, dragStart.current.oy + dy, zoom));
    } else if (e.touches.length === 2 && pinchRef.current) {
      const dx   = e.touches[0].clientX - e.touches[1].clientX;
      const dy   = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const newZoom = Math.max(1, Math.min(5, pinchRef.current.startZoom * (dist / pinchRef.current.dist)));
      setZoom(newZoom);
      if (newZoom <= 1) setOffset({ x: 0, y: 0 });
      else setOffset(prev => clamp(prev.x, prev.y, newZoom));
    }
  }

  function handleTouchEnd() {
    dragStart.current = null;
    pinchRef.current  = null;
  }

  // ── Scroll-wheel zoom (desktop) ──────────────────────────────────────────
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect    = el.getBoundingClientRect();
    const factor  = e.deltaY < 0 ? 1.25 : 0.8;
    const newZoom = Math.max(1, Math.min(5, zoom * factor));
    if (newZoom <= 1) { setZoom(1); setOffset({ x: 0, y: 0 }); return; }
    const sx    = e.clientX - rect.left  - rect.width / 2;
    const sy    = e.clientY - rect.top   - rect.height / 2;
    const scale = newZoom / zoom;
    setZoom(newZoom);
    setOffset(clamp(
      sx * (1 - scale) + offset.x * scale,
      sy * (1 - scale) + offset.y * scale,
      newZoom,
    ));
  }

  function resetZoom() { setZoom(1); setOffset({ x: 0, y: 0 }); }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ minHeight, touchAction: 'none' }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Main image (shows server-enhanced version once ready) ────────── */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={displaySrc}
        alt="Captured work photo"
        draggable={false}
        className="w-full h-full object-cover"
        style={{
          filter:          filterStr,
          transform:       `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
          transformOrigin: 'center',
          transition:      isDragging.current ? 'none' : 'transform 0.08s ease-out',
          cursor:          zoom > 1 ? 'grab' : 'zoom-in',
          userSelect:      'none',
          WebkitUserSelect: 'none',
          display:         'block',
          minHeight,
        }}
      />

      {/* ── Enhancement loading overlay ──────────────────────────────────── */}
      {enhancing && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 pointer-events-none"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}>
          {/* Spinner */}
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className="animate-spin">
            <circle cx="14" cy="14" r="11" stroke="rgba(255,255,255,0.15)" strokeWidth="3"/>
            <path d="M14 3 A11 11 0 0 1 25 14" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <span className="text-[11px] font-semibold text-sky-300">Enhancing pixels…</span>
          <span className="text-[9px] text-zinc-400">CLAHE · Unsharp mask · Deblur</span>
        </div>
      )}

      {/* ── Top-right: control buttons ─────────────────────────────────── */}
      <div className="absolute top-2 right-2 flex gap-1 z-10">
        {zoom > 1 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); resetZoom(); }}
            className="text-[10px] font-bold px-2 py-1 rounded-full"
            style={{ background: 'rgba(0,0,0,0.72)', color: 'white', border: '1px solid rgba(255,255,255,0.15)' }}
          >
            Reset
          </button>
        )}
        {/* Only show compare button once enhancement is done */}
        {!enhancing && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setShowOriginal(p => !p); }}
            className="text-[10px] font-bold px-2 py-1 rounded-full transition-colors"
            style={{
              background: 'rgba(0,0,0,0.72)',
              color:      showOriginal ? '#fbbf24' : '#4ade80',
              border:     showOriginal ? '1px solid #fbbf2490' : '1px solid rgba(74,222,128,0.3)',
            }}
          >
            {showOriginal ? '○ Original' : '✨ Enhanced'}
          </button>
        )}
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setShowControls(p => !p); }}
          className="text-[10px] font-bold px-2 py-1 rounded-full transition-colors"
          style={{
            background: showControls ? 'rgba(56,189,248,0.18)' : 'rgba(0,0,0,0.72)',
            color:      showControls ? '#38bdf8' : '#e2e8f0',
            border:     showControls ? '1px solid #38bdf840' : '1px solid rgba(255,255,255,0.15)',
          }}
        >
          ⚙
        </button>
      </div>

      {/* ── Top-left: status + zoom badge ───────────────────────────────── */}
      {!enhancing && (
        <div className="absolute top-2 left-2 z-10 pointer-events-none flex items-center gap-1">
          {/* Enhancement status chip */}
          {!showOriginal && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: enhanceFailed ? 'rgba(239,68,68,0.15)' : 'rgba(74,222,128,0.12)',
                color:      enhanceFailed ? '#f87171' : '#4ade80',
                border:     enhanceFailed ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(74,222,128,0.2)',
              }}
            >
              {enhanceFailed ? '⚠ raw' : '✓ deblurred'}
            </span>
          )}
          {/* Zoom badge */}
          {zoom > 1.05 && (
            <span
              className="text-[11px] font-black px-2 py-0.5 rounded-full tabular-nums"
              style={{ background: 'rgba(0,0,0,0.72)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}
            >
              {zoom.toFixed(1)}×
            </span>
          )}
        </div>
      )}

      {/* ── Bottom-left: double-tap hint (fades when zoomed) ───────────── */}
      {zoom <= 1 && !enhancing && (
        <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
          <span className="text-[9px] text-white/35">Double-tap to zoom in</span>
        </div>
      )}

      {/* ── Adjustment panel (fine-tune on top of server enhancement) ───── */}
      {showControls && (
        <div
          className="absolute bottom-0 left-0 right-0 z-20 rounded-t-2xl px-4 pt-3 pb-4 space-y-3"
          style={{ background: 'rgba(10,10,15,0.92)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.08)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Handle bar */}
          <div className="flex justify-center mb-1">
            <div className="w-8 h-0.5 rounded-full bg-zinc-600" />
          </div>

          <p className="text-[9px] text-zinc-500 text-center -mt-1">
            Fine-tune on top of AI deblur · base values
          </p>

          {/* Contrast */}
          <SliderRow
            label="Contrast"
            icon="◑"
            value={contrast}
            min={0.5} max={2.5} step={0.05}
            onChange={v => { setContrast(v); setShowOriginal(false); }}
            effectiveValue={zoom > 1.05 ? effectiveContrast : undefined}
          />

          {/* Brightness */}
          <SliderRow
            label="Bright"
            icon="☀"
            value={brightness}
            min={0.5} max={2.0} step={0.05}
            onChange={v => { setBrightness(v); setShowOriginal(false); }}
          />

          {/* Reset defaults */}
          <button
            type="button"
            onClick={() => { setContrast(1.0); setBrightness(1.0); setShowOriginal(false); }}
            className="w-full text-[10px] text-zinc-500 hover:text-zinc-300 text-center py-1 transition-colors"
          >
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Reusable slider row ──────────────────────────────────────────────────────
function SliderRow({
  label, icon, value, min, max, step, onChange, effectiveValue,
}: {
  label: string; icon: string; value: number;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
  /** If provided, shows the auto-boosted effective value alongside the base */
  effectiveValue?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[13px] text-zinc-400 w-4 text-center shrink-0">{icon}</span>
      <span className="text-[11px] text-zinc-300 w-11 shrink-0">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 rounded-full appearance-none accent-sky-400"
        style={{ background: `linear-gradient(to right, #38bdf8 ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) 0%)` }}
      />
      <div className="flex flex-col items-end shrink-0" style={{ minWidth: '2.5rem' }}>
        <span className="text-[11px] text-zinc-300 tabular-nums leading-none">{value.toFixed(2)}</span>
        {effectiveValue !== undefined && (
          <span className="text-[9px] tabular-nums leading-none mt-0.5" style={{ color: '#4ade80' }}>
            →{effectiveValue.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}
