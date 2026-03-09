// Shared board zone utilities — used by both the client picker and server API route.
// Keep this file free of any 'use client' or browser-only APIs.

export type ZoneId =
  | 'corner-tl' | 'top-left'  | 'top-ctr'  | 'top-right' | 'corner-tr'
  | 'left-top'  | 'midl-top'  | 'mid-top'  | 'midr-top'  | 'right-top'
  | 'left-mid'  | 'midl-mid'  | 'center'   | 'midr-mid'  | 'right-mid'
  | 'left-bot'  | 'midl-bot'  | 'mid-bot'  | 'midr-bot'  | 'right-bot'
  | 'corner-bl' | 'bot-left'  | 'bot-ctr'  | 'bot-right' | 'corner-br';

export type Zone = {
  id: ZoneId;
  label: string;
  fullName: string;
  row: number;
  col: number;
  isCorner?: boolean;
};

export const ZONES: Zone[] = [
  // Row 0 — Top edge
  { id: 'corner-tl', label: 'TL',   fullName: 'Top-Left Corner',     row: 0, col: 0, isCorner: true },
  { id: 'top-left',  label: 'T-L',  fullName: 'Top Left',            row: 0, col: 1 },
  { id: 'top-ctr',   label: 'T-C',  fullName: 'Top Centre',          row: 0, col: 2 },
  { id: 'top-right', label: 'T-R',  fullName: 'Top Right',           row: 0, col: 3 },
  { id: 'corner-tr', label: 'TR',   fullName: 'Top-Right Corner',    row: 0, col: 4, isCorner: true },
  // Row 1 — Upper middle
  { id: 'left-top',  label: 'L-T',  fullName: 'Left Side Top',       row: 1, col: 0 },
  { id: 'midl-top',  label: 'ML-T', fullName: 'Mid-Left Top',        row: 1, col: 1 },
  { id: 'mid-top',   label: 'M-T',  fullName: 'Centre Top',          row: 1, col: 2 },
  { id: 'midr-top',  label: 'MR-T', fullName: 'Mid-Right Top',       row: 1, col: 3 },
  { id: 'right-top', label: 'R-T',  fullName: 'Right Side Top',      row: 1, col: 4 },
  // Row 2 — Centre
  { id: 'left-mid',  label: 'L-M',  fullName: 'Left Side Middle',    row: 2, col: 0 },
  { id: 'midl-mid',  label: 'ML-M', fullName: 'Mid-Left Middle',     row: 2, col: 1 },
  { id: 'center',    label: 'CTR',  fullName: 'Board Centre',        row: 2, col: 2 },
  { id: 'midr-mid',  label: 'MR-M', fullName: 'Mid-Right Middle',    row: 2, col: 3 },
  { id: 'right-mid', label: 'R-M',  fullName: 'Right Side Middle',   row: 2, col: 4 },
  // Row 3 — Lower middle
  { id: 'left-bot',  label: 'L-B',  fullName: 'Left Side Bottom',    row: 3, col: 0 },
  { id: 'midl-bot',  label: 'ML-B', fullName: 'Mid-Left Bottom',     row: 3, col: 1 },
  { id: 'mid-bot',   label: 'M-B',  fullName: 'Centre Bottom',       row: 3, col: 2 },
  { id: 'midr-bot',  label: 'MR-B', fullName: 'Mid-Right Bottom',    row: 3, col: 3 },
  { id: 'right-bot', label: 'R-B',  fullName: 'Right Side Bottom',   row: 3, col: 4 },
  // Row 4 — Bottom edge
  { id: 'corner-bl', label: 'BL',   fullName: 'Bottom-Left Corner',  row: 4, col: 0, isCorner: true },
  { id: 'bot-left',  label: 'B-L',  fullName: 'Bottom Left',         row: 4, col: 1 },
  { id: 'bot-ctr',   label: 'B-C',  fullName: 'Bottom Centre',       row: 4, col: 2 },
  { id: 'bot-right', label: 'B-R',  fullName: 'Bottom Right',        row: 4, col: 3 },
  { id: 'corner-br', label: 'BR',   fullName: 'Bottom-Right Corner', row: 4, col: 4, isCorner: true },
];

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
