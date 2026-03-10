'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { ComponentMarkers, MarkerPosition } from '@/app/api/admin/checklists/locate/route';

// ── Types ──────────────────────────────────────────────────────────────────────
export type ComponentDef = { id: string; name: string; count: number };
export type MarkerSet = { componentId: string; name: string; color: string; positions: MarkerPosition[] };

// ── Color palette for component types ─────────────────────────────────────────
const COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
  '#f59e0b', '#6366f1', '#10b981', '#e11d48', '#7c3aed',
];

type Props = {
  /** Board reference image URL (proxy or blob:) */
  imageUrl: string;
  /** Component items from the current stage/product */
  components: ComponentDef[];
  /** Pre-existing marker data (if any) */
  initialMarkers?: MarkerSet[];
  onSave: (markers: MarkerSet[]) => Promise<void>;
  onClose: () => void;
};

export function BoardMapper({ imageUrl, components, initialMarkers = [], onSave, onClose }: Props) {
  // Assign stable colors to each component
  const colorMap = useRef<Record<string, string>>({});
  components.forEach((c, i) => {
    if (!colorMap.current[c.id]) colorMap.current[c.id] = COLORS[i % COLORS.length];
  });

  const [markerSets, setMarkerSets] = useState<MarkerSet[]>(() =>
    components.map((c) => {
      const existing = initialMarkers.find((m) => m.componentId === c.id);
      return existing ?? { componentId: c.id, name: c.name, color: colorMap.current[c.id], positions: [] };
    })
  );

  const [selectedId, setSelectedId]     = useState<string>(components[0]?.id ?? '');
  const [locating, setLocating]         = useState(false);
  const [locateError, setLocateError]   = useState('');
  const [saving, setSaving]             = useState(false);
  const [imgSize, setImgSize]           = useState({ w: 0, h: 0 });
  const [dragIdx, setDragIdx]           = useState<{ setIdx: number; posIdx: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getRelative = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const selectedSet = markerSets.find((m) => m.componentId === selectedId);
  const selectedComp = components.find((c) => c.id === selectedId);

  // ── Add marker on image click ─────────────────────────────────────────────
  function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (dragIdx) return; // was a drag, not a click
    const { x, y } = getRelative(e.clientX, e.clientY);
    const set = markerSets.find((m) => m.componentId === selectedId)!;
    const prefix = set.name.charAt(0).toUpperCase();
    const label = `${prefix}${set.positions.length + 1}`;
    setMarkerSets((prev) =>
      prev.map((m) =>
        m.componentId === selectedId
          ? { ...m, positions: [...m.positions, { x, y, label }] }
          : m
      )
    );
  }

  // ── Remove marker on right-click ─────────────────────────────────────────
  function removeMarker(setIdx: number, posIdx: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setMarkerSets((prev) =>
      prev.map((m, i) =>
        i === setIdx ? { ...m, positions: m.positions.filter((_, j) => j !== posIdx) } : m
      )
    );
  }

  // ── Drag markers ─────────────────────────────────────────────────────────
  function startDrag(setIdx: number, posIdx: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragIdx({ setIdx, posIdx });
  }

  useEffect(() => {
    if (!dragIdx) return;
    function onMove(e: MouseEvent) {
      if (!dragIdx || !containerRef.current) return;
      const { x, y } = getRelative(e.clientX, e.clientY);
      setMarkerSets((prev) =>
        prev.map((m, i) =>
          i === dragIdx.setIdx
            ? {
                ...m,
                positions: m.positions.map((p, j) =>
                  j === dragIdx.posIdx ? { ...p, x, y } : p
                ),
              }
            : m
        )
      );
    }
    function onUp() { setDragIdx(null); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragIdx, getRelative]);

  // ── AI auto-locate ────────────────────────────────────────────────────────
  async function autoLocate() {
    setLocating(true); setLocateError('');
    try {
      const res = await fetch('/api/admin/checklists/locate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          components: components.map((c) => ({ name: c.name, count: c.count })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setLocateError(data.error ?? 'Locate failed'); return; }

      // Merge AI results into markerSets
      setMarkerSets((prev) =>
        prev.map((m) => {
          const aiResult = (data.markers as ComponentMarkers[]).find(
            (r) => r.name.toLowerCase() === m.name.toLowerCase()
          );
          if (!aiResult) return m;
          return { ...m, positions: aiResult.positions };
        })
      );
    } catch (e) {
      setLocateError(e instanceof Error ? e.message : 'AI locate failed');
    } finally { setLocating(false); }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    try { await onSave(markerSets); } finally { setSaving(false); }
  }

  // ── Total counts ─────────────────────────────────────────────────────────
  const totalPlaced = markerSets.reduce((s, m) => s + m.positions.length, 0);
  const totalExpected = components.reduce((s, c) => s + c.count, 0);
  const allDone = markerSets.every((m) => {
    const comp = components.find((c) => c.id === m.componentId);
    return m.positions.length >= (comp?.count ?? 0);
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0a0a0a' }}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
        <span className="text-lg">📍</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">PCB Component Position Mapper</p>
          <p className="text-[10px] text-zinc-500">
            Click on image to place a marker for the selected component • Right-click marker to remove • Drag to reposition
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Progress pill */}
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${allDone ? 'text-green-400' : 'text-amber-400'}`}
            style={{ background: allDone ? 'rgba(34,197,94,0.1)' : 'rgba(251,191,36,0.1)' }}>
            {totalPlaced} / {totalExpected} placed
          </span>
          <button
            onClick={autoLocate}
            disabled={locating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#c084fc' }}
          >
            {locating ? (
              <><span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" /> Detecting…</>
            ) : '🤖 AI Auto-detect'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white transition-all"
            style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', border: '1px solid rgba(34,197,94,0.4)' }}
          >
            {saving ? 'Saving…' : '✓ Save positions'}
          </button>
          <button onClick={onClose} className="text-zinc-500 hover:text-white px-2 py-1.5 rounded-lg text-sm transition-colors" style={{ background: 'rgba(255,255,255,0.04)' }}>
            ✕ Close
          </button>
        </div>
      </div>

      {locateError && (
        <div className="px-4 py-2 text-xs text-red-400 shrink-0" style={{ background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
          🤖 {locateError}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ── Left panel: component selector ────────────────────────────────── */}
        <div className="w-56 shrink-0 flex flex-col p-3 space-y-2 overflow-y-auto" style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Select component</p>
          {markerSets.map((ms) => {
            const comp = components.find((c) => c.id === ms.componentId)!;
            const placed = ms.positions.length;
            const target = comp.count;
            const done = placed >= target;
            const isSelected = selectedId === ms.componentId;
            return (
              <button
                key={ms.componentId}
                onClick={() => setSelectedId(ms.componentId)}
                className="w-full text-left rounded-xl p-2.5 transition-all"
                style={{
                  background: isSelected ? `${ms.color}18` : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isSelected ? ms.color + '55' : 'rgba(255,255,255,0.06)'}`,
                  boxShadow: isSelected ? `0 0 0 1px ${ms.color}30` : 'none',
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ms.color }} />
                  <span className="flex-1 text-xs font-medium text-zinc-200 leading-tight">{comp.name}</span>
                  <span className={`text-xs font-bold ${done ? 'text-green-400' : placed > 0 ? 'text-amber-400' : 'text-zinc-600'}`}>
                    {placed}/{target}
                  </span>
                </div>
                <div className="mt-1.5 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div className="h-1 rounded-full transition-all" style={{ width: `${Math.min(100, (placed / target) * 100)}%`, background: done ? '#22c55e' : ms.color }} />
                </div>
              </button>
            );
          })}

          <div className="pt-2 border-t border-zinc-800 space-y-1.5">
            <p className="text-[10px] text-zinc-600">Right-click any marker to remove it. Drag to reposition.</p>
            <button
              onClick={() => setMarkerSets((prev) => prev.map((m) => ({ ...m, positions: [] })))}
              className="w-full py-1.5 rounded-lg text-xs text-zinc-600 hover:text-red-400 transition-colors"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
            >
              🗑 Clear all markers
            </button>
          </div>
        </div>

        {/* ── Main image area ────────────────────────────────────────────────── */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" style={{ background: '#111' }}>
          <div
            ref={containerRef}
            className="relative select-none"
            style={{ cursor: dragIdx ? 'grabbing' : 'crosshair', maxWidth: '100%', maxHeight: '100%' }}
            onClick={handleImageClick}
          >
            {/* Board image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="PCB Board"
              draggable={false}
              style={{ display: 'block', maxWidth: '100%', maxHeight: 'calc(100vh - 120px)', borderRadius: '8px' }}
              onLoad={(e) => {
                const el = e.target as HTMLImageElement;
                setImgSize({ w: el.offsetWidth, h: el.offsetHeight });
              }}
            />

            {/* SVG overlay — lines, circles, labels */}
            {imgSize.w > 0 && (
              <svg
                className="absolute inset-0 pointer-events-none"
                width={imgSize.w}
                height={imgSize.h}
                style={{ position: 'absolute', top: 0, left: 0 }}
              >
                {markerSets.map((ms) =>
                  ms.positions.map((p, pi) => {
                    const cx = p.x * imgSize.w;
                    const cy = p.y * imgSize.h;
                    const r = 10;
                    return (
                      <g key={`${ms.componentId}-${pi}`}>
                        {/* Outer ring */}
                        <circle cx={cx} cy={cy} r={r + 3} fill="none" stroke="white" strokeWidth={1.5} opacity={0.4} />
                        {/* Filled circle */}
                        <circle cx={cx} cy={cy} r={r} fill={ms.color} fillOpacity={0.85} stroke="white" strokeWidth={1.5} />
                        {/* Label */}
                        <text
                          x={cx + r + 4}
                          y={cy + 4}
                          fontSize={10}
                          fontWeight="700"
                          fill="white"
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)', userSelect: 'none' }}
                        >
                          {p.label}
                        </text>
                      </g>
                    );
                  })
                )}
              </svg>
            )}

            {/* Clickable/draggable hit areas per marker */}
            {imgSize.w > 0 &&
              markerSets.map((ms, si) =>
                ms.positions.map((p, pi) => (
                  <div
                    key={`hit-${ms.componentId}-${pi}`}
                    className="absolute"
                    style={{
                      left: p.x * imgSize.w - 14,
                      top: p.y * imgSize.h - 14,
                      width: 28,
                      height: 28,
                      cursor: 'grab',
                      borderRadius: '50%',
                    }}
                    title={`${p.label} (${ms.name}) — right-click to remove`}
                    onMouseDown={(e) => { e.stopPropagation(); startDrag(si, pi, e); }}
                    onContextMenu={(e) => removeMarker(si, pi, e)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ))
              )}
          </div>
        </div>

        {/* ── Right panel: legend + instructions ────────────────────────────── */}
        <div className="w-48 shrink-0 flex flex-col p-3 space-y-3 overflow-y-auto" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Legend</p>
          {markerSets.map((ms) => (
            <div key={ms.componentId} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: ms.color }} />
              <p className="text-[11px] text-zinc-400 truncate">{ms.name}</p>
            </div>
          ))}

          <div className="pt-2 border-t border-zinc-800 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">How to use</p>
            <div className="space-y-1.5 text-[11px] text-zinc-500">
              <p>1. Select component from the list</p>
              <p>2. Click on the board to place a marker</p>
              <p>3. Drag markers to adjust position</p>
              <p>4. Right-click to remove a marker</p>
              <p>5. Or click <strong className="text-purple-400">🤖 AI Auto-detect</strong> to let AI place all markers automatically</p>
              <p>6. Click <strong className="text-green-400">✓ Save positions</strong> when done</p>
            </div>
          </div>

          {selectedComp && selectedSet && (
            <div className="pt-2 border-t border-zinc-800">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-1.5">Active</p>
              <div className="rounded-lg p-2 text-[11px]" style={{ background: `${selectedSet.color}12`, border: `1px solid ${selectedSet.color}33` }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ background: selectedSet.color }} />
                  <span className="font-semibold text-zinc-200">{selectedComp.name}</span>
                </div>
                <p className="text-zinc-500">
                  {selectedSet.positions.length}/{selectedComp.count} placed
                  {selectedSet.positions.length >= selectedComp.count && <span className="text-green-400 ml-1">✓ Done</span>}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
