'use client';

// Visual PCB board grid — click zones to mark where a component lives.
// Pure utilities live in lib/boardZones.ts so server routes can import them safely.

import { ZONES, ZoneId, parseZoneIds, zonesToText, serializeZones } from '@/lib/boardZones';

export type { ZoneId };
export { parseZoneIds, zonesToText, serializeZones };

type Props = {
  value: string;           // comma-separated zone IDs (stored value)
  onChange: (value: string) => void;
};

export function BoardLocationPicker({ value, onChange }: Props) {
  const selected = parseZoneIds(value);

  function toggle(id: ZoneId) {
    const next = selected.includes(id)
      ? selected.filter(s => s !== id)
      : [...selected, id];
    onChange(serializeZones(next));
  }

  function clearAll() { onChange(''); }

  // Build 5×5 grid
  const grid = Array.from({ length: 5 }, (_, r) =>
    Array.from({ length: 5 }, (_, c) => ZONES.find(z => z.row === r && z.col === c) ?? null)
  );

  const readableText = zonesToText(selected);

  return (
    <div className="space-y-3">
      {/* Grid */}
      <div
        className="rounded-xl p-3 select-none"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            PCB Board — click zones to select
          </p>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {/* 5×5 grid */}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {grid.map((row, ri) =>
            row.map((zone, ci) => {
              if (!zone) return <div key={`${ri}-${ci}`} />;
              const isSelected = selected.includes(zone.id);
              const isCorner   = zone.isCorner;
              return (
                <button
                  key={zone.id}
                  type="button"
                  title={zone.fullName}
                  onClick={() => toggle(zone.id)}
                  className="rounded-lg flex items-center justify-center transition-all active:scale-95"
                  style={{
                    aspectRatio: '1',
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    background: isSelected
                      ? 'rgba(14,165,233,0.25)'
                      : isCorner
                      ? 'rgba(168,85,247,0.07)'
                      : 'rgba(255,255,255,0.04)',
                    border: isSelected
                      ? '1.5px solid rgba(14,165,233,0.7)'
                      : isCorner
                      ? '1px solid rgba(168,85,247,0.2)'
                      : '1px solid rgba(255,255,255,0.07)',
                    color: isSelected
                      ? '#38bdf8'
                      : isCorner
                      ? 'rgba(168,85,247,0.5)'
                      : 'rgba(255,255,255,0.3)',
                    boxShadow: isSelected ? '0 0 8px rgba(14,165,233,0.2)' : 'none',
                  }}
                >
                  {zone.label}
                </button>
              );
            })
          )}
        </div>

        {/* Legend */}
        <div className="mt-2.5 flex items-center gap-3 text-[9px] text-zinc-600">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded" style={{ background: 'rgba(14,165,233,0.25)', border: '1.5px solid rgba(14,165,233,0.7)' }} />
            Selected
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded" style={{ background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)' }} />
            Corner
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }} />
            Zone
          </span>
        </div>
      </div>

      {/* Readable output */}
      {selected.length > 0 ? (
        <div
          className="rounded-lg px-3 py-2"
          style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}
        >
          <p className="text-[10px] text-zinc-500 mb-0.5">AI will receive:</p>
          <p className="text-xs text-sky-400 leading-relaxed">{readableText}</p>
          <p className="text-[10px] text-zinc-600 mt-1">
            {selected.length} zone{selected.length !== 1 ? 's' : ''} selected
          </p>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-600 text-center">
          No zones selected — click cells above to mark component location
        </p>
      )}
    </div>
  );
}
