'use client';

// Visual PCB board grid — click zones to mark where a component lives.
// Zones are stored as comma-separated IDs, e.g. "left-top,left-mid,left-bot"

export type ZoneId =
  | 'corner-tl' | 'top-left'  | 'top-ctr'  | 'top-right' | 'corner-tr'
  | 'left-top'  | 'midl-top'  | 'mid-top'  | 'midr-top'  | 'right-top'
  | 'left-mid'  | 'midl-mid'  | 'center'   | 'midr-mid'  | 'right-mid'
  | 'left-bot'  | 'midl-bot'  | 'mid-bot'  | 'midr-bot'  | 'right-bot'
  | 'corner-bl' | 'bot-left'  | 'bot-ctr'  | 'bot-right' | 'corner-br';

type Zone = {
  id: ZoneId;
  label: string;
  fullName: string;
  row: number;
  col: number;
  isCorner?: boolean;
};

export const ZONES: Zone[] = [
  // Row 0 — Top edge
  { id: 'corner-tl', label: 'TL',   fullName: 'Top-Left Corner',    row: 0, col: 0, isCorner: true },
  { id: 'top-left',  label: 'T-L',  fullName: 'Top Left',           row: 0, col: 1 },
  { id: 'top-ctr',   label: 'T-C',  fullName: 'Top Centre',         row: 0, col: 2 },
  { id: 'top-right', label: 'T-R',  fullName: 'Top Right',          row: 0, col: 3 },
  { id: 'corner-tr', label: 'TR',   fullName: 'Top-Right Corner',   row: 0, col: 4, isCorner: true },
  // Row 1 — Upper middle
  { id: 'left-top',  label: 'L-T',  fullName: 'Left Side Top',      row: 1, col: 0 },
  { id: 'midl-top',  label: 'ML-T', fullName: 'Mid-Left Top',       row: 1, col: 1 },
  { id: 'mid-top',   label: 'M-T',  fullName: 'Centre Top',         row: 1, col: 2 },
  { id: 'midr-top',  label: 'MR-T', fullName: 'Mid-Right Top',      row: 1, col: 3 },
  { id: 'right-top', label: 'R-T',  fullName: 'Right Side Top',     row: 1, col: 4 },
  // Row 2 — Centre
  { id: 'left-mid',  label: 'L-M',  fullName: 'Left Side Middle',   row: 2, col: 0 },
  { id: 'midl-mid',  label: 'ML-M', fullName: 'Mid-Left Middle',    row: 2, col: 1 },
  { id: 'center',    label: 'CTR',  fullName: 'Board Centre',       row: 2, col: 2 },
  { id: 'midr-mid',  label: 'MR-M', fullName: 'Mid-Right Middle',   row: 2, col: 3 },
  { id: 'right-mid', label: 'R-M',  fullName: 'Right Side Middle',  row: 2, col: 4 },
  // Row 3 — Lower middle
  { id: 'left-bot',  label: 'L-B',  fullName: 'Left Side Bottom',   row: 3, col: 0 },
  { id: 'midl-bot',  label: 'ML-B', fullName: 'Mid-Left Bottom',    row: 3, col: 1 },
  { id: 'mid-bot',   label: 'M-B',  fullName: 'Centre Bottom',      row: 3, col: 2 },
  { id: 'midr-bot',  label: 'MR-B', fullName: 'Mid-Right Bottom',   row: 3, col: 3 },
  { id: 'right-bot', label: 'R-B',  fullName: 'Right Side Bottom',  row: 3, col: 4 },
  // Row 4 — Bottom edge
  { id: 'corner-bl', label: 'BL',   fullName: 'Bottom-Left Corner', row: 4, col: 0, isCorner: true },
  { id: 'bot-left',  label: 'B-L',  fullName: 'Bottom Left',        row: 4, col: 1 },
  { id: 'bot-ctr',   label: 'B-C',  fullName: 'Bottom Centre',      row: 4, col: 2 },
  { id: 'bot-right', label: 'B-R',  fullName: 'Bottom Right',       row: 4, col: 3 },
  { id: 'corner-br', label: 'BR',   fullName: 'Bottom-Right Corner',row: 4, col: 4, isCorner: true },
];

// ── helpers ───────────────────────────────────────────────────────────────────

/** Parse a stored location string back into zone IDs */
export function parseZoneIds(locationStr: string | null | undefined): ZoneId[] {
  if (!locationStr) return [];
  return locationStr
    .split(',')
    .map(s => s.trim())
    .filter((s): s is ZoneId => ZONES.some(z => z.id === s));
}

/** Convert selected zone IDs to human-readable text for AI */
export function zonesToText(ids: ZoneId[]): string {
  if (ids.length === 0) return '';
  return ids.map(id => ZONES.find(z => z.id === id)?.fullName ?? id).join(', ');
}

/** Serialize zone IDs to storage string */
export function serializeZones(ids: ZoneId[]): string {
  return ids.join(',');
}

// ── component ─────────────────────────────────────────────────────────────────

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
  const grid: (Zone | null)[][] = Array.from({ length: 5 }, (_, r) =>
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
        {/* Board label */}
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">PCB Board — click zones to select</p>
          {selected.length > 0 && (
            <button type="button" onClick={clearAll} className="text-[10px] text-zinc-600 hover:text-red-400 transition-colors">
              Clear all
            </button>
          )}
        </div>

        {/* 5×5 grid */}
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}
        >
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

        {/* Zone legend */}
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

      {/* Selected zones readable output */}
      {selected.length > 0 ? (
        <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}>
          <p className="text-[10px] text-zinc-500 mb-0.5">AI will receive:</p>
          <p className="text-xs text-sky-400 leading-relaxed">{readableText}</p>
          <p className="text-[10px] text-zinc-600 mt-1">{selected.length} zone{selected.length !== 1 ? 's' : ''} selected</p>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-600 text-center">No zones selected — click cells above to mark component location</p>
      )}
    </div>
  );
}
