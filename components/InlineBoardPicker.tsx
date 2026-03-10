'use client';

import { useRef, useCallback, useState, useEffect } from 'react';

export type MarkerPosition = { x: number; y: number; label: string; size?: ComponentSize };

export type ComponentSize = 'micro' | 'mini' | 'small' | 'big' | 'macro';

/** Maps size name → base SVG radius (scales with zoom) */
export const SIZE_RADIUS: Record<ComponentSize, number> = {
  micro: 3,   // SMD 0402 resistors, tiny caps
  mini:  5,   // SMD 0603 caps, small diodes
  small: 7,   // Standard SMD, TO-92
  big:   12,  // MOSFETs, ICs, headers
  macro: 18,  // Spacers, transformers, large caps
};

/** Minimum marker spacing per size (prevents accidental overlap) */
export const SIZE_MIN_DIST: Record<ComponentSize, number> = {
  micro: 0.008,  // very tight — closely packed strips
  mini:  0.014,
  small: 0.022,
  big:   0.035,
  macro: 0.055,
};

type Props = {
  /** Board reference image URL (proxy URL is fine — fetched directly) */
  imageUrl: string;
  /** First letter used for labels: "M" → M1, M2, M3 */
  componentName: string;
  /** Total expected count — drives the progress indicator */
  expectedCount: number;
  /** Default size for newly placed markers */
  defaultSize?: ComponentSize;
  positions: MarkerPosition[];
  onChange: (positions: MarkerPosition[]) => void;
};

export function InlineBoardPicker({
  imageUrl,
  componentName,
  expectedCount,
  defaultSize = 'small',
  positions,
  onChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [imgRender,  setImgRender]  = useState({ w: 0, h: 0 });
  const [dragging, setDragging]     = useState<number | null>(null);
  const dragDidMove = useRef(false);

  // Recompute rendered size on resize
  useEffect(() => {
    const el = containerRef.current?.querySelector('img');
    if (!el) return;
    const obs = new ResizeObserver(() => {
      setImgRender({ w: el.clientWidth, h: el.clientHeight });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const getRelative = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const el = containerRef.current?.querySelector('img');
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const prefix = (componentName || 'C').charAt(0).toUpperCase();

  function relabel(arr: MarkerPosition[]): MarkerPosition[] {
    return arr.map((p, i) => ({ ...p, label: `${prefix}${i + 1}` }));
  }

  // ── Click on image to add a new marker ──────────────────────────────────────
  function handleImgClick(e: React.MouseEvent<HTMLDivElement>) {
    if (dragging !== null || dragDidMove.current) return;
    const { x, y } = getRelative(e.clientX, e.clientY);
    // Respect size-based minimum distance
    const minDist = SIZE_MIN_DIST[defaultSize];
    const tooClose = positions.some(p => {
      const dx = p.x - x, dy = p.y - y;
      return Math.sqrt(dx * dx + dy * dy) < minDist;
    });
    if (tooClose) return;
    onChange(relabel([...positions, { x, y, label: '', size: defaultSize }]));
  }

  // ── Drag to reposition ───────────────────────────────────────────────────────
  function startDrag(idx: number, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    dragDidMove.current = false;
    setDragging(idx);

    function onMove(mv: MouseEvent) {
      dragDidMove.current = true;
      const { x, y } = getRelative(mv.clientX, mv.clientY);
      onChange(
        relabel(positions.map((p, i) => (i === idx ? { ...p, x, y } : p)))
      );
    }
    function onUp() {
      setDragging(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // ── Right-click to remove ────────────────────────────────────────────────────
  function removeMarker(idx: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onChange(relabel(positions.filter((_, i) => i !== idx)));
  }

  const placed    = positions.length;
  const isOver    = expectedCount > 0 && placed > expectedCount;
  const isDone    = expectedCount > 0 && placed === expectedCount;
  const countColor = isOver ? 'text-red-400' : isDone ? 'text-green-400' : 'text-amber-400';

  const W = imgRender.w || 1;
  const H = imgRender.h || 1;

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
          Click board to place each component • right-click to remove
        </p>
        <div className="flex items-center gap-2">
          {placed > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
          <span className={`text-[11px] font-bold tabular-nums ${countColor}`}>
            {placed}{expectedCount > 0 ? ` / ${expectedCount}` : ''} placed
          </span>
        </div>
      </div>

      {/* Board image + SVG overlay */}
      <div
        ref={containerRef}
        className="relative rounded-xl overflow-hidden select-none"
        style={{
          border: '1.5px solid rgba(255,255,255,0.1)',
          cursor: dragging !== null ? 'grabbing' : 'crosshair',
        }}
        onClick={handleImgClick}
        onContextMenu={e => e.preventDefault()}
      >
        {/* Board image */}
        <img
          src={imageUrl}
          alt="Board reference"
          draggable={false}
          className="w-full object-contain pointer-events-none"
          style={{ maxHeight: '300px', display: 'block' }}
          onLoad={e => {
            const img = e.currentTarget;
            setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
            setImgRender({ w: img.clientWidth, h: img.clientHeight });
          }}
        />

        {/* SVG overlay — exactly covers the image */}
        {imgRender.w > 0 && (
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            style={{ width: imgRender.w, height: imgRender.h }}
            viewBox={`0 0 ${W} ${H}`}
          >
            {positions.map((pos, i) => {
              const cx = pos.x * W;
              const cy = pos.y * H;
              // Size-based radius: maps to physical image pixels based on component size
              const baseR = SIZE_RADIUS[pos.size ?? defaultSize];
              const r  = Math.round(W * baseR / 100); // baseR as % of width
              const fs = Math.max(4, Math.round(r * 0.65));

              return (
                <g key={i}>
                  {/* Outer glow ring */}
                  <circle cx={cx} cy={cy} r={r + 2} fill="rgba(0,0,0,0.45)" />
                  {/* Main circle */}
                  <circle cx={cx} cy={cy} r={r} fill="#ef4444" stroke="white" strokeWidth={1.5} />
                  {/* Label */}
                  <text
                    x={cx} y={cy + fs * 0.35}
                    textAnchor="middle"
                    fontSize={fs}
                    fontWeight="800"
                    fill="white"
                    style={{ userSelect: 'none' }}
                  >
                    {pos.label}
                  </text>

                  {/* Invisible hit zone — handles drag + right-click */}
                  <circle
                    cx={cx} cy={cy} r={r + 4}
                    fill="transparent"
                    className="pointer-events-auto"
                    style={{ cursor: 'grab' }}
                    onMouseDown={e => startDrag(i, e)}
                    onContextMenu={e => removeMarker(i, e)}
                    onClick={e => e.stopPropagation()}
                  />
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Progress dots */}
      {expectedCount > 0 && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: expectedCount }).map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-colors"
              style={{
                width: 8, height: 8,
                background: i < placed
                  ? (isOver ? '#f87171' : isDone ? '#4ade80' : '#f59e0b')
                  : 'rgba(255,255,255,0.1)',
                border: i < placed ? 'none' : '1px solid rgba(255,255,255,0.15)',
              }}
              title={i < placed ? `${prefix}${i + 1} placed` : `${prefix}${i + 1} missing`}
            />
          ))}
        </div>
      )}

      {isDone && (
        <p className="text-[10px] text-green-400">
          ✓ All {expectedCount} positions marked
        </p>
      )}
      {isOver && (
        <p className="text-[10px] text-red-400">
          ⚠ {placed - expectedCount} extra marker{placed - expectedCount !== 1 ? 's' : ''} — right-click to remove
        </p>
      )}
    </div>
  );
}
