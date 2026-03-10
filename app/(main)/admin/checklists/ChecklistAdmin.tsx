'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import * as XLSX from 'xlsx';
import { InlineBoardPicker } from '@/components/InlineBoardPicker';
import type { MarkerPosition as InlineMarkerPosition } from '@/components/InlineBoardPicker';
import { zonesToText, parseZoneIds } from '@/lib/boardZones';
import { blobImgUrl } from '@/lib/blobUrl';
import type { ScannedComponent } from '@/app/api/admin/checklists/scan/route';
import { BoardMapper } from './BoardMapper';
import type { MarkerSet } from './BoardMapper';

// ── Bulk import row ────────────────────────────────────────────────────────────
type BulkRow = {
  name: string;
  expectedCount: number;
  orientationRule: string;
  boardLocation: string;
  description: string;
  required: boolean;
  error?: string;
};

// ── Component preset library ──────────────────────────────────────────────────
// Select a preset → rules auto-fill → just enter quantity
type Preset = {
  id: string;
  emoji: string;
  label: string;
  name: string;
  orientationRule: string;
  description: string;
  required: boolean;
};

const COMPONENT_PRESETS: Preset[] = [
  {
    id: 'mosfet',
    emoji: '⚡',
    label: 'MOSFET',
    name: 'MOSFET',
    orientationRule: 'Heatsink tab must face outward from board centre',
    description: 'Reversed MOSFET destroys the board when powered — check every unit individually',
    required: true,
  },
  {
    id: 'resistor',
    emoji: '▬',
    label: 'Resistor',
    name: 'Resistor',
    orientationRule: '',
    description: 'Verify correct value installed, no physical damage or wrong position',
    required: true,
  },
  {
    id: 'smd-cap',
    emoji: '▪',
    label: 'SMD Cap',
    name: 'SMD Ceramic Capacitor',
    orientationRule: '',
    description: 'All capacitors in strip must be present — no missing, cracked, or tombstoned caps',
    required: true,
  },
  {
    id: 'elec-cap',
    emoji: '🔋',
    label: 'Elec. Cap',
    name: 'Electrolytic Capacitor',
    orientationRule: 'Negative stripe (white band) must match negative pad marking on PCB silkscreen',
    description: 'Polarised component — reversed cap will fail or rupture under power',
    required: true,
  },
  {
    id: 'diode',
    emoji: '▷',
    label: 'Diode',
    name: 'Diode',
    orientationRule: 'Cathode band (silver/grey stripe) must face the direction marked on PCB',
    description: 'Reversed diode causes immediate circuit failure',
    required: true,
  },
  {
    id: 'ic',
    emoji: '▣',
    label: 'IC / Chip',
    name: 'IC',
    orientationRule: 'Pin 1 dot or notch must align with the triangle marker on PCB silkscreen',
    description: 'Reversed IC causes immediate damage — verify pin 1 on every unit',
    required: true,
  },
  {
    id: 'header',
    emoji: '⬛',
    label: 'Header',
    name: 'Header',
    orientationRule: 'Pins must be straight and connector fully seated into PCB',
    description: 'Verify connector is not tilted, missing pins, or partially inserted',
    required: true,
  },
  {
    id: 'bus-bar',
    emoji: '━',
    label: 'Bus Bar',
    name: 'Bus Bar',
    orientationRule: '',
    description: 'Must be completely flat against board surface — not lifted, shifted, or angled',
    required: true,
  },
  {
    id: 'inductor',
    emoji: '〰',
    label: 'Inductor',
    name: 'Inductor',
    orientationRule: '',
    description: 'Verify correct value, fully seated, no physical damage',
    required: true,
  },
  {
    id: 'transformer',
    emoji: '⊞',
    label: 'Transformer',
    name: 'Transformer',
    orientationRule: 'Pin 1 orientation must match triangle/dot marker on PCB silkscreen',
    description: 'Verify seating, orientation, and no bent pins',
    required: true,
  },
  {
    id: 'spacer',
    emoji: '🔩',
    label: 'Spacer',
    name: 'Spacer',
    orientationRule: '',
    description: 'All spacers must be present and properly secured at corners',
    required: false,
  },
  {
    id: 'custom',
    emoji: '✏️',
    label: 'Custom',
    name: '',
    orientationRule: '',
    description: '',
    required: true,
  },
];

const STAGES = [
  { key: 'POWERSTAGE_MANUFACTURING', label: 'Powerstage' },
  { key: 'BRAINBOARD_MANUFACTURING', label: 'Brainboard' },
  { key: 'CONTROLLER_ASSEMBLY',      label: 'Assembly' },
  { key: 'QC_AND_SOFTWARE',          label: 'QC & Software' },
  { key: 'FINAL_ASSEMBLY',           label: 'Final Assembly' },
];

type ChecklistItem = {
  id: string;
  productId: string | null;
  stage: string;
  name: string;
  description: string | null;
  referenceImageUrl: string | null;
  expectedCount: number | null;
  orientationRule: string | null;
  boardLocation: string | null;
  componentPositions: string | null; // JSON MarkerPosition[]
  isBoardReference: boolean;
  required: boolean;
  sortOrder: number;
  active: boolean;
};

type Product = { id: string; name: string; code: string };

// null = "Global (all models)" tab
type ProductTab = string | null;

type Props = { initialItems: ChecklistItem[]; products: Product[] };

export function ChecklistAdmin({ initialItems, products }: Props) {
  const [items, setItems]               = useState(initialItems);
  const [activeStage, setActiveStage]   = useState(STAGES[0].key);
  const [activeProduct, setActiveProduct] = useState<ProductTab>(
    products.length === 1 ? products[0].id : null
  );
  const [showAdd, setShowAdd]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  // Board reference image state
  const boardRefInputRef             = useRef<HTMLInputElement>(null);
  const [boardRefFile, setBoardRefFile] = useState<File | null>(null);
  const [boardRefPreview, setBoardRefPreview] = useState('');
  const [savingBoardRef, setSavingBoardRef]   = useState(false);

  // Board mapper state
  const [showMapper, setShowMapper] = useState(false);

  // Bulk spreadsheet import state
  const bulkInputRef                          = useRef<HTMLInputElement>(null);
  const [bulkRows, setBulkRows]               = useState<BulkRow[] | null>(null);
  const [bulkUploading, setBulkUploading]     = useState(false);
  const [bulkError, setBulkError]             = useState('');

  // AI scan state
  const [scanning, setScanning]             = useState(false);
  const [scanResults, setScanResults]       = useState<ScannedComponent[] | null>(null);
  const [scanError, setScanError]           = useState('');
  // Per-row editable counts for scan results
  const [scanCounts, setScanCounts]         = useState<Record<number, number>>({});
  const [scanLocations, setScanLocations]   = useState<Record<number, string>>({});
  const [addingAll, setAddingAll]           = useState(false);

  // Pick & place state
  const [pickMode, setPickMode]             = useState(false);
  const [pickTab, setPickTab]               = useState<'ai' | 'manual'>('ai');
  const [picking, setPicking]               = useState(false);
  const [pickError, setPickError]           = useState('');
  const [pickQueue, setPickQueue]           = useState<Array<{ id: string; x: number; y: number; positions?: InlineMarkerPosition[]; component: ScannedComponent; qty: number }>>([]);
  const [lastPick, setLastPick]             = useState<{ x: number; y: number; component: ScannedComponent } | null>(null);
  const [lastPickQty, setLastPickQty]       = useState(1);
  const [savingQueue, setSavingQueue]       = useState(false);
  // Manual add state
  const [manualPreset, setManualPreset]     = useState('mosfet');
  const [manualName, setManualName]         = useState('');
  const [manualQty, setManualQty]           = useState(1);
  const [manualStep, setManualStep]         = useState<1 | 2 | 3>(1);
  // Individual numbered positions (replaces single zone click)
  const [manualPositions, setManualPositions] = useState<InlineMarkerPosition[]>([]);

  // Component form state
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: '', description: '', required: true, sortOrder: 0,
    expectedCount: '', orientationRule: '', boardLocation: '',
  });
  const [refImage, setRefImage]     = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [showAdvanced, setShowAdvanced]     = useState(false);
  // Inline board position picker state (replaces zone grid)
  const [newComponentPositions, setNewComponentPositions] = useState<InlineMarkerPosition[]>([]);

  // Items for current stage + current product tab.
  // On a product-specific tab we show:
  //   1. Items specific to that product (productId === activeProduct)
  //   2. Global items (productId === null) shown with a dimmed "Global" badge
  // On the "Global" tab we show only global items (productId === null).
  const stageItems = items.filter((i) =>
    i.stage === activeStage && !i.isBoardReference &&
    (i.productId === activeProduct ||
     (activeProduct !== null && i.productId === null))
  );
  // Board ref: prefer product-specific with image, then any product-specific, then global with image, then global
  // (handles edge case where multiple board refs exist — always show the one with an image)
  const findBoardRef = (pId: string | null) => {
    const matches = items.filter((i) => i.stage === activeStage && i.isBoardReference && i.productId === pId);
    return matches.find((i) => !!i.referenceImageUrl) ?? matches[0];
  };
  const boardRefItem =
    findBoardRef(activeProduct) ??
    (activeProduct !== null ? findBoardRef(null) : undefined);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setRefImage(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function handleBoardRefChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBoardRefFile(f);
    setBoardRefPreview(URL.createObjectURL(f));
  }

  // Save / replace board reference image for this stage + product
  async function saveBoardRef() {
    if (!boardRefFile) return;
    setSavingBoardRef(true); setError('');
    try {
      const fd = new FormData();
      fd.append('stage', activeStage);
      fd.append('name', '__BOARD_REFERENCE__');
      fd.append('isBoardReference', 'true');
      fd.append('required', 'false');
      fd.append('sortOrder', '-999');
      fd.append('referenceImage', boardRefFile);
      if (activeProduct) fd.append('productId', activeProduct);

      if (boardRefItem) {
        // Update existing board reference
        const res = await fetch(`/api/admin/checklists/${boardRefItem.id}`, { method: 'PATCH', body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? `Failed to save board reference (${res.status})`);
          return;
        }
        const updated = await res.json();
        setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      } else {
        // Create new board reference item
        const res = await fetch('/api/admin/checklists', { method: 'POST', body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? `Failed to save board reference (${res.status})`);
          return;
        }
        const item = await res.json();
        setItems((prev) => [...prev, item]);
      }
      setBoardRefFile(null);
      setBoardRefPreview('');
    } finally { setSavingBoardRef(false); }
  }

  async function deleteBoardRef() {
    if (!boardRefItem) return;
    if (!confirm('Remove the board reference image for this stage?')) return;
    const res = await fetch(`/api/admin/checklists/${boardRefItem.id}`, { method: 'DELETE' });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== boardRefItem.id));
      setBoardRefPreview('');
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      fd.append('stage',           activeStage);
      fd.append('name',            form.name);
      fd.append('description',     form.description);
      fd.append('required',        String(form.required));
      fd.append('sortOrder',       String(form.sortOrder));
      fd.append('expectedCount',   form.expectedCount);
      fd.append('orientationRule', form.orientationRule);
      fd.append('boardLocation',   form.boardLocation);
      fd.append('isBoardReference', 'false');
      if (activeProduct) fd.append('productId', activeProduct);
      if (refImage) fd.append('referenceImage', refImage);

      const res = await fetch('/api/admin/checklists', { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `Failed to save (${res.status})`);
        return;
      }
      let item = await res.json();

      // Save component positions if any were placed on the board image
      if (newComponentPositions.length > 0) {
        const patchRes = await fetch(`/api/admin/checklists/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ componentPositions: JSON.stringify(newComponentPositions) }),
        });
        if (patchRes.ok) item = await patchRes.json();
      }

      setItems((prev) => [...prev, item]);
      setShowAdd(false);
      setForm({ name: '', description: '', required: true, sortOrder: 0, expectedCount: '', orientationRule: '', boardLocation: '' });
      setRefImage(null); setPreviewUrl('');
      setSelectedPreset(''); setShowAdvanced(false);
      setNewComponentPositions([]);
    } finally { setSaving(false); }
  }

  async function toggleActive(item: ChecklistItem) {
    const res = await fetch(`/api/admin/checklists/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    }
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this checklist item?')) return;
    const res = await fetch(`/api/admin/checklists/${id}`, { method: 'DELETE' });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
  }

  // ── Bulk spreadsheet import ──────────────────────────────────────────────────
  function downloadTemplate() {
    // ── Sheet 1: Sample Data (ready to use) ──────────────────────────────────
    const sampleRows = [
      ['name', 'count', 'orientation_rule', 'board_location', 'description', 'required'],
      // MOSFETs
      ['MOSFET IRFB4227',              18, 'Heatsink tab must face outward from board centre',                    'TL,TR,BL,BR', 'Power switching MOSFETs — reversed MOSFET destroys board when powered',         'true'],
      // Electrolytic caps
      ['Electrolytic Capacitor 1000uF', 4, 'Negative stripe (white band) must match PCB negative pad marking',   'ML,MR',       'DC bus capacitors — check polarity every unit',                                 'true'],
      ['Electrolytic Capacitor 100uF',  6, 'Negative stripe (white band) must match PCB negative pad marking',   'TC,BC',       'Gate drive bypass capacitors',                                                   'true'],
      // SMD ceramic caps
      ['SMD Ceramic Capacitor 100nF',  24, '',                                                                    'TL,TR,BL,BR', 'Decoupling caps — all must be present, no tombstoning or cracks',               'true'],
      ['SMD Ceramic Capacitor 10uF',    8, '',                                                                    'ML,MR',       'Bulk decoupling — check for missing or cracked parts',                          'true'],
      // Diodes
      ['Schottky Diode SS34',          12, 'Cathode band (grey stripe) must face the direction marked on PCB',    'BL,BR',       'Freewheeling diodes — reversed diode causes immediate failure',                  'true'],
      ['Zener Diode BZX84',             4, 'Cathode band must face direction marked on PCB silkscreen',           'TC',          'Gate clamp diodes',                                                              'true'],
      // ICs / gate drivers
      ['IC Gate Driver IR2110',         2, 'Pin 1 dot or notch must align with triangle marker on PCB',           'MC',          'Half-bridge gate drivers — reversed IC causes immediate damage',                 'true'],
      ['IC Optocoupler HCPL-314J',      2, 'Pin 1 dot must align with triangle marker on PCB silkscreen',         'ML',          'Isolated gate drive optocouplers',                                               'true'],
      // Inductors
      ['Inductor 10uH',                 3, '',                                                                    'TC,BC',       'Output filter inductors — verify correct value and fully seated',                'true'],
      // Transformers
      ['Gate Drive Transformer',        1, 'Pin 1 orientation must match triangle/dot marker on PCB silkscreen',  'MC',          'Isolated gate drive transformer — verify seating and no bent pins',             'true'],
      // Headers / connectors
      ['Header 2x10 Pin',               2, 'Pins must be straight and connector fully seated into PCB',           'ML',          'Motor phase output connectors',                                                  'true'],
      ['Header 1x3 Pin',                4, 'Pins must be straight and connector fully seated into PCB',           'TR',          'Temperature sensor connectors',                                                  'false'],
      // Bus bar
      ['Copper Bus Bar',                2, '',                                                                    'BL,BR',       'Must be completely flat against board — not lifted, shifted, or angled',         'true'],
      // Resistors
      ['Shunt Resistor 1mΩ',            3, '',                                                                    'BC',          'Current sensing shunts — verify correct value, no physical damage',             'true'],
      ['SMD Resistor 10kΩ',            16, '',                                                                    'TL,TR',       'Gate and bias resistors — verify all present and correct value',                 'true'],
      // Spacers
      ['PCB Standoff Spacer M3',        4, '',                                                                    'TL,TR,BL,BR', 'Corner spacers — all must be present and properly secured',                      'false'],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(sampleRows);
    ws1['!cols'] = [{ wch: 32 }, { wch: 7 }, { wch: 58 }, { wch: 18 }, { wch: 52 }, { wch: 10 }];

    // Style the header row bold (xlsx-style, supported in xlsx pro — basic version just sets freeze)
    ws1['!freeze'] = { xSplit: 0, ySplit: 1 };

    // ── Sheet 2: Instructions ─────────────────────────────────────────────────
    const instrRows = [
      ['SMX Drives — Checklist Bulk Upload Template', '', '', '', '', ''],
      ['', '', '', '', '', ''],
      ['COLUMN', 'REQUIRED?', 'ACCEPTED VALUES', '', 'NOTES', ''],
      ['name',             'YES', 'Any text',                            '', 'Component name, e.g. "MOSFET IRFB4227"', ''],
      ['count',            'YES', 'Number (1, 2, 18 …)',                 '', 'How many of this component are on the board', ''],
      ['orientation_rule', 'No',  'Any text',                            '', 'Leave blank if component has no polarity', ''],
      ['board_location',   'No',  'Zone codes: TL TC TR ML MC MR BL BC BR', '', 'Comma-separated, e.g. TL,TR,BL,BR', ''],
      ['description',      'No',  'Any text',                            '', 'Extra instructions for the AI inspector', ''],
      ['required',         'No',  'true / false / yes / no',             '', 'Default: true — board fails if issue found', ''],
      ['', '', '', '', '', ''],
      ['ZONE MAP (top-down view of board)', '', '', '', '', ''],
      ['TL  TC  TR', '', '', '', '← TOP of board', ''],
      ['ML  MC  MR', '', '', '', '← MIDDLE of board', ''],
      ['BL  BC  BR', '', '', '', '← BOTTOM of board', ''],
      ['', '', '', '', '', ''],
      ['TIPS:', '', '', '', '', ''],
      ['• You can also use column names: component, qty, quantity, orientation, location, zone, notes, mandatory', '', '', '', '', ''],
      ['• Column names are NOT case-sensitive', '', '', '', '', ''],
      ['• Delete or clear the sample rows on "Components" sheet and replace with your own data', '', '', '', '', ''],
      ['• Save as .xlsx or export as .csv before uploading', '', '', '', '', ''],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(instrRows);
    ws2['!cols'] = [{ wch: 40 }, { wch: 12 }, { wch: 40 }, { wch: 4 }, { wch: 48 }, { wch: 4 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Components');
    XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');
    XLSX.writeFile(wb, 'smx-checklist-sample.xlsx');
  }

  function parseSpreadsheet(file: File) {
    setBulkError(''); setBulkRows(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

        if (rows.length === 0) { setBulkError('Spreadsheet is empty'); return; }

        // Flexible column name lookup (case-insensitive)
        const col = (row: Record<string, unknown>, ...keys: string[]): string => {
          for (const k of keys) {
            const found = Object.keys(row).find(rk => rk.toLowerCase().replace(/[\s_-]/g, '') === k.toLowerCase().replace(/[\s_-]/g, ''));
            if (found && row[found] !== undefined && row[found] !== '') return String(row[found]).trim();
          }
          return '';
        };

        const parsed: BulkRow[] = rows.map((row, idx) => {
          const name         = col(row, 'name', 'component', 'componentname', 'partname', 'part');
          const countRaw     = col(row, 'count', 'qty', 'quantity', 'expectedcount', 'expected');
          const expectedCount = parseInt(countRaw, 10) || 1;
          const orientationRule = col(row, 'orientationrule', 'orientation', 'rule', 'polarity');
          const boardLocation   = col(row, 'boardlocation', 'location', 'zone', 'boardzone');
          const description     = col(row, 'description', 'notes', 'note', 'instructions');
          const reqRaw          = col(row, 'required', 'mandatory', 'critical');
          const required        = reqRaw === '' ? true : !['false', 'no', '0', 'n'].includes(reqRaw.toLowerCase());
          const error           = !name ? `Row ${idx + 2}: "name" column is empty` : undefined;
          return { name, expectedCount, orientationRule, boardLocation, description, required, error };
        });

        const withErrors = parsed.filter(r => r.error);
        if (withErrors.length === parsed.length) { setBulkError('No valid rows found. Make sure the sheet has a "name" column.'); return; }
        setBulkRows(parsed);
      } catch (err) {
        setBulkError(`Could not read file: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function addAllBulk() {
    if (!bulkRows) return;
    setBulkUploading(true);
    try {
      const validRows = bulkRows.filter(r => !r.error && r.name);
      const added: ChecklistItem[] = [];
      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i];
        const fd = new FormData();
        fd.append('stage',            activeStage);
        fd.append('name',             r.name);
        fd.append('description',      r.description);
        fd.append('required',         String(r.required));
        fd.append('sortOrder',        String(i));
        fd.append('expectedCount',    String(r.expectedCount));
        fd.append('orientationRule',  r.orientationRule);
        fd.append('boardLocation',    r.boardLocation);
        fd.append('isBoardReference', 'false');
        if (activeProduct) fd.append('productId', activeProduct);
        const res = await fetch('/api/admin/checklists', { method: 'POST', body: fd });
        if (res.ok) added.push(await res.json());
      }
      setItems(prev => [...prev, ...added]);
      setBulkRows(null);
    } finally { setBulkUploading(false); }
  }

  // ── Save component positions from BoardMapper ─────────────────────────────
  async function savePositions(markerSets: MarkerSet[]) {
    // Save each component's positions to its checklist item
    const updates = markerSets.filter((ms) => ms.positions.length > 0);
    const updatedItems = [...items];
    for (const ms of updates) {
      const item = stageItems.find((i) => i.id === ms.componentId);
      if (!item) continue;
      const res = await fetch(`/api/admin/checklists/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ componentPositions: JSON.stringify(ms.positions) }),
      });
      if (res.ok) {
        const updated = await res.json();
        const idx = updatedItems.findIndex((i) => i.id === item.id);
        if (idx >= 0) updatedItems[idx] = updated;
      }
    }
    setItems(updatedItems);
    setShowMapper(false);
  }

  // ── AI board scan ────────────────────────────────────────────────────────────
  async function scanBoard() {
    if (!boardRefItem?.referenceImageUrl) return;
    setScanning(true); setScanError(''); setScanResults(null);
    try {
      const res = await fetch('/api/admin/checklists/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: boardRefItem.referenceImageUrl }),
      });
      const data = await res.json();
      if (!res.ok) { setScanError(data.error ?? 'Scan failed'); return; }
      setScanResults(data.components);
      // Initialise editable counts/locations from AI results
      const counts: Record<number, number> = {};
      const locs: Record<number, string> = {};
      data.components.forEach((c: ScannedComponent, i: number) => {
        counts[i] = c.expectedCount;
        locs[i]   = c.boardLocation;
      });
      setScanCounts(counts);
      setScanLocations(locs);
    } catch (e) {
      setScanError(e instanceof Error ? e.message : 'Scan failed');
    } finally { setScanning(false); }
  }

  async function addAllScanned() {
    if (!scanResults) return;
    setAddingAll(true);
    try {
      const added: ChecklistItem[] = [];
      for (let i = 0; i < scanResults.length; i++) {
        const c = scanResults[i];
        const fd = new FormData();
        fd.append('stage',           activeStage);
        fd.append('name',            c.name);
        fd.append('description',     c.description);
        fd.append('required',        String(c.required));
        fd.append('sortOrder',       String(i));
        fd.append('expectedCount',   String(scanCounts[i] ?? c.expectedCount));
        fd.append('orientationRule', c.orientationRule);
        fd.append('boardLocation',   scanLocations[i] ?? c.boardLocation);
        fd.append('isBoardReference', 'false');
        if (activeProduct) fd.append('productId', activeProduct);
        const res = await fetch('/api/admin/checklists', { method: 'POST', body: fd });
        if (res.ok) added.push(await res.json());
      }
      setItems((prev) => [...prev, ...added]);
      setScanResults(null);
    } finally { setAddingAll(false); }
  }

  // ── Pick & place ─────────────────────────────────────────────────────────────
  function xyToZone(x: number, y: number): string {
    const col = x < 0.33 ? 'L' : x < 0.67 ? 'C' : 'R';
    const row = y < 0.33 ? 'T' : y < 0.67 ? 'M' : 'B';
    return row + col;
  }

  async function handleImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!pickMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Manual tab step 3: place numbered markers for each component instance
    if (pickTab === 'manual' && manualStep === 3) {
      const preset = COMPONENT_PRESETS.find(p => p.id === manualPreset) ?? COMPONENT_PRESETS[0];
      const name = manualName.trim() || preset.name;
      const prefix = name.charAt(0).toUpperCase();
      const num = manualPositions.length + 1;
      setManualPositions(prev => [...prev, { x, y, label: `${prefix}${num}` }]);
      return;
    }

    // AI tab: identify component via Claude
    if (pickTab === 'ai' && !picking) {
      setPicking(true); setPickError('');
      try {
        const res = await fetch('/api/admin/checklists/pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: boardRefItem!.referenceImageUrl, x, y }),
        });
        const data = await res.json();
        if (!res.ok) { setPickError(data.error ?? 'Pick failed'); return; }
        setLastPick({ x, y, component: data.component });
        setLastPickQty(1);
      } catch (err) {
        setPickError(err instanceof Error ? err.message : 'Pick failed');
      } finally { setPicking(false); }
    }
  }

  function confirmLastPick() {
    if (!lastPick) return;
    const id = Math.random().toString(36).slice(2);
    setPickQueue(prev => [...prev, { id, x: lastPick.x, y: lastPick.y, component: lastPick.component, qty: lastPickQty }]);
    setLastPick(null);
    setLastPickQty(1);
  }

  async function savePickQueue() {
    if (pickQueue.length === 0) return;
    setSavingQueue(true);
    try {
      const newItems: ChecklistItem[] = [];
      for (let idx = 0; idx < pickQueue.length; idx++) {
        const { component: c, qty, positions } = pickQueue[idx];
        const fd = new FormData();
        fd.append('stage',           activeStage);
        fd.append('name',            c.name);
        fd.append('description',     c.description);
        fd.append('required',        String(c.required));
        fd.append('sortOrder',       String(stageItems.length + idx));
        fd.append('expectedCount',   String(qty));
        fd.append('orientationRule', c.orientationRule);
        fd.append('boardLocation',   c.boardLocation ?? '');
        fd.append('isBoardReference', 'false');
        if (activeProduct) fd.append('productId', activeProduct);
        const res = await fetch('/api/admin/checklists', { method: 'POST', body: fd });
        if (!res.ok) continue;
        let item = await res.json();
        // Save individual component positions if they were placed
        if (positions && positions.length > 0) {
          const pr = await fetch(`/api/admin/checklists/${item.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ componentPositions: JSON.stringify(positions) }),
          });
          if (pr.ok) item = await pr.json();
        }
        newItems.push(item);
      }
      setItems(prev => [...prev, ...newItems]);
      setPickQueue([]);
      setLastPick(null);
      setPickMode(false);
      setPickError('');
    } finally { setSavingQueue(false); }
  }

  function exitPickMode() {
    if (pickQueue.length > 0 && !confirm(`Discard ${pickQueue.length} picked component${pickQueue.length > 1 ? 's' : ''}?`)) return;
    setPickMode(false);
    setPickQueue([]);
    setLastPick(null);
    setPickError('');
    setManualStep(1);
    setManualPositions([]);
    setManualName('');
    setManualQty(1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-zinc-500 hover:text-white text-sm">← Admin</Link>
        <h2 className="text-xl font-semibold">Stage Checklists</h2>
      </div>
      <p className="text-zinc-500 text-sm">
        Define what components the AI must verify at each stage. Upload a board reference image and add each component with count and orientation rules.
      </p>

      {/* Stage tabs */}
      <div className="flex gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {STAGES.map((s) => {
          const count  = items.filter((i) => i.stage === s.key && i.active && !i.isBoardReference && (activeProduct ? i.productId === activeProduct : true)).length;
          // Green dot: has board ref for current product OR has a global board ref (inherited)
          const hasRef = items.some((i) =>
            i.stage === s.key && i.isBoardReference && i.referenceImageUrl &&
            (activeProduct ? (i.productId === activeProduct || i.productId === null) : true));
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => { setActiveStage(s.key); setShowAdd(false); setSelectedPreset(''); setShowAdvanced(false); setActiveProduct(products.length === 1 ? products[0].id : null); }}
              className={`flex-shrink-0 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeStage === s.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
              style={activeStage === s.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}
            >
              {hasRef && <span className="text-green-400 text-[10px]">●</span>}
              {s.label} {count > 0 && <span className="opacity-60">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* ── Product model tabs ───────────────────────────────────────────────── */}
      {products.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Product model</p>
          <div className="flex gap-1 flex-wrap">
            {/* "All models / Global" tab — only show when there are multiple products */}
            {products.length > 1 && (
              <button
                type="button"
                onClick={() => { setActiveProduct(null); setShowAdd(false); setSelectedPreset(''); setShowAdvanced(false); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeProduct === null ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                style={activeProduct === null ? { background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)' } : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                🌐 Global (all models)
              </button>
            )}
            {products.map((p) => {
              const hasRef  = items.some((i) => i.stage === activeStage && i.isBoardReference && i.referenceImageUrl && i.productId === p.id);
              const count   = items.filter((i) => i.stage === activeStage && i.active && !i.isBoardReference && i.productId === p.id).length;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setActiveProduct(p.id); setShowAdd(false); setSelectedPreset(''); setShowAdvanced(false); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeProduct === p.id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                  style={activeProduct === p.id ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)' } : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  {hasRef && <span className="text-green-400 text-[9px]">●</span>}
                  SMX{p.code} — {p.name}
                  {count > 0 && <span className="opacity-50">({count})</span>}
                </button>
              );
            })}
          </div>
          {activeProduct === null && products.length > 1 && (
            <p className="text-[10px] text-zinc-600">
              Global items apply to ALL product models. Use this for checks common across every board.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-xl p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* ── Board Reference Image ─────────────────────────────────────────────── */}
      <div className="card p-4 space-y-3" style={{ border: '1px solid rgba(251,191,36,0.2)', background: 'rgba(251,191,36,0.03)' }}>
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-base">📸</span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-amber-300">Board Reference Image</p>
              {/* Show product badge only when the board ref is product-specific */}
              {activeProduct && boardRefItem?.productId === activeProduct && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}>
                  {products.find(p => p.id === activeProduct)?.name ?? ''}
                </span>
              )}
              {/* Show Global badge when: on Global tab, OR on product tab but using inherited global ref */}
              {(!activeProduct || (activeProduct && boardRefItem?.productId === null)) && products.length > 1 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}>
                  {activeProduct ? '🌐 Inherited from Global' : 'Global'}
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500">Upload a clear top-down photo of a CORRECT completed board. The AI will compare every employee submission against this image.</p>
          </div>
        </div>

        <div className="flex gap-3 items-start">
          {/* Current reference */}
          <div
            className="relative w-32 h-24 rounded-xl overflow-hidden shrink-0 cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${boardRefItem?.referenceImageUrl ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.1)'}` }}
            onClick={() => boardRefInputRef.current?.click()}
          >
            {(boardRefPreview || boardRefItem?.referenceImageUrl) ? (
              <Image
                src={boardRefPreview || blobImgUrl(boardRefItem!.referenceImageUrl)}
                alt="Board reference"
                fill
                unoptimized
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,0.4)" strokeWidth="1.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <p className="text-[10px] text-zinc-600">Click to upload</p>
              </div>
            )}
            {boardRefItem?.referenceImageUrl && !boardRefPreview && (
              <div className="absolute top-1 right-1">
                <span className="text-[9px] font-bold px-1 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.8)', color: 'white' }}>✓ SET</span>
              </div>
            )}
          </div>
          <input ref={boardRefInputRef} type="file" accept="image/*" className="hidden" onChange={handleBoardRefChange} />

          <div className="flex-1 flex flex-col gap-2">
            {boardRefFile ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-300">New image selected: {boardRefFile.name}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveBoardRef}
                    disabled={savingBoardRef}
                    className="flex-1 py-2 rounded-lg text-xs font-bold text-black"
                    style={{ background: 'linear-gradient(135deg, #fbbf24, #f59e0b)' }}
                  >
                    {savingBoardRef ? 'Saving…' : '✓ Save Reference'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setBoardRefFile(null); setBoardRefPreview(''); }}
                    className="px-3 py-2 rounded-lg text-xs text-zinc-500"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => boardRefInputRef.current?.click()}
                  className="w-full py-2 rounded-lg text-xs font-medium text-amber-400"
                  style={{ background: 'rgba(251,191,36,0.08)', border: '1px dashed rgba(251,191,36,0.3)' }}
                >
                  {boardRefItem?.referenceImageUrl ? '🔄 Replace reference image' : '+ Upload board reference image'}
                </button>
                {/* AI scan button — only when a reference image is set */}
                {boardRefItem?.referenceImageUrl && (
                  <button
                    type="button"
                    onClick={scanBoard}
                    disabled={scanning}
                    className="w-full py-2 rounded-lg text-xs font-bold transition-all"
                    style={{ background: scanning ? 'rgba(139,92,246,0.08)' : 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#c084fc' }}
                  >
                    {scanning ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                        Scanning board…
                      </span>
                    ) : '🤖 Auto-detect components with AI'}
                  </button>
                )}
                {/* Pick & place button */}
                {boardRefItem?.referenceImageUrl && (
                  <button
                    type="button"
                    onClick={() => { setPickMode(true); setScanResults(null); }}
                    className="w-full py-2 rounded-lg text-xs font-bold transition-all"
                    style={{ background: 'rgba(20,184,166,0.12)', border: '1px solid rgba(20,184,166,0.3)', color: '#2dd4bf' }}
                  >
                    🎯 Pick & Place components
                  </button>
                )}
                {boardRefItem?.referenceImageUrl && (
                  <button type="button" onClick={deleteBoardRef} className="text-[11px] text-zinc-600 hover:text-red-400 transition-colors">
                    Remove
                  </button>
                )}
              </div>
            )}

            {!boardRefItem?.referenceImageUrl && !boardRefPreview && (
              <div className="text-[11px] text-zinc-600 space-y-0.5">
                <p>• Use good diffused lighting (avoid glare)</p>
                <p>• Top-down, board fills the frame</p>
                <p>• All components must be clearly visible</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── AI Scan error ─────────────────────────────────────────────────────── */}
      {scanError && (
        <div className="rounded-xl p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          🤖 Scan error: {scanError}
        </div>
      )}

      {/* ── Pick & Place mode ──────────────────────────────────────────────────── */}
      {pickMode && boardRefItem?.referenceImageUrl && (
        <div className="card p-4" style={{ border: '1px solid rgba(20,184,166,0.25)', background: 'rgba(20,184,166,0.03)' }}>
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-teal-300">🎯 Pick & Place Mode</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {picking ? 'Identifying component…' : 'Click a component on the board, set its qty, then save all at once.'}
              </p>
            </div>
            <button
              type="button"
              onClick={exitPickMode}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-400 transition-all"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              ✕ Cancel
            </button>
          </div>

          {/* Two-panel layout: image left, component list right */}
          <div className="flex gap-3" style={{ alignItems: 'flex-start' }}>

            {/* Left: Interactive board image */}
            <div className="flex-1 min-w-0">
              {/* Board label */}
              {pickTab === 'manual' && manualStep === 3 && (
                <p className="text-[10px] text-purple-400 mb-1 text-center">
                  👆 Click image for each component position ({manualPositions.length}{manualQty > 0 ? ` / ${manualQty}` : ''} placed) • right-click on marker to remove
                </p>
              )}
              <div
                className="relative w-full rounded-xl overflow-hidden select-none"
                style={{
                  aspectRatio: '16/9',
                  background: 'rgba(0,0,0,0.4)',
                  border: pickTab === 'manual' && manualStep === 3
                    ? '1px solid rgba(139,92,246,0.6)'
                    : `1px solid ${picking ? 'rgba(20,184,166,0.6)' : 'rgba(20,184,166,0.3)'}`,
                  cursor: picking ? 'wait' : 'crosshair',
                }}
                onClick={handleImageClick}
                onContextMenu={e => { if (pickTab === 'manual' && manualStep === 3) e.preventDefault(); }}
              >
                <Image
                  src={blobImgUrl(boardRefItem.referenceImageUrl)}
                  alt="Board reference"
                  fill
                  unoptimized
                  className="object-contain"
                  style={{ pointerEvents: 'none' }}
                />

                {/* SVG overlay */}
                <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                  {/* Queued markers */}
                  {pickQueue.map((m, i) => (
                    <g key={m.id}>
                      <circle cx={`${m.x * 100}%`} cy={`${m.y * 100}%`} r="10" fill="rgba(20,184,166,0.85)" stroke="white" strokeWidth="2" />
                      <text x={`${m.x * 100}%`} y={`${m.y * 100}%`} textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="bold" fill="white">{i + 1}</text>
                    </g>
                  ))}

                  {/* Manual position markers — numbered red circles (right-click to remove) */}
                  {pickTab === 'manual' && manualStep === 3 && manualPositions.map((pos, i) => (
                    <g key={i} style={{ pointerEvents: 'all', cursor: 'pointer' }}
                      onContextMenu={e => {
                        e.preventDefault(); e.stopPropagation();
                        setManualPositions(prev => {
                          const next = prev.filter((_, j) => j !== i);
                          const prefix = (manualName.trim() || COMPONENT_PRESETS.find(p => p.id === manualPreset)?.name || 'C').charAt(0).toUpperCase();
                          return next.map((p, j) => ({ ...p, label: `${prefix}${j + 1}` }));
                        });
                      }}>
                      <circle cx={`${pos.x * 100}%`} cy={`${pos.y * 100}%`} r="11" fill="rgba(239,68,68,0.9)" stroke="white" strokeWidth="1.5" />
                      <text x={`${pos.x * 100}%`} y={`${pos.y * 100}%`} textAnchor="middle" dominantBaseline="central" fontSize="8" fontWeight="800" fill="white" style={{ pointerEvents: 'none' }}>{pos.label}</text>
                    </g>
                  ))}

                  {/* Last pick marker (amber, not yet confirmed) */}
                  {lastPick && (
                    <g>
                      <circle cx={`${lastPick.x * 100}%`} cy={`${lastPick.y * 100}%`} r="12" fill="none" stroke="rgba(251,191,36,0.6)" strokeWidth="2" />
                      <circle cx={`${lastPick.x * 100}%`} cy={`${lastPick.y * 100}%`} r="6" fill="rgba(251,191,36,0.9)" stroke="white" strokeWidth="1.5" />
                    </g>
                  )}

                  {/* Loading spinner */}
                  {picking && (
                    <g>
                      <circle cx="50%" cy="50%" r="14" fill="none" stroke="rgba(20,184,166,0.4)" strokeWidth="2" />
                      <circle cx="50%" cy="50%" r="14" fill="none" stroke="rgba(20,184,166,0.9)" strokeWidth="2"
                        strokeDasharray="22 66" strokeLinecap="round">
                        <animateTransform attributeName="transform" type="rotate" from="0 50% 50%" to="360 50% 50%" dur="0.8s" repeatCount="indefinite" />
                      </circle>
                    </g>
                  )}
                </svg>

                {/* Hint overlay */}
                {!picking && !lastPick && pickQueue.length === 0 && !(pickTab === 'manual' && manualStep === 3) && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="px-3 py-1.5 rounded-lg text-xs text-teal-300" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(20,184,166,0.3)' }}>
                      Click on a component
                    </div>
                  </div>
                )}
              </div>
              {pickError && (
                <div className="mt-2 rounded-lg p-2 text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  {pickError}
                </div>
              )}
            </div>

            {/* Right: Add panel + queue */}
            <div className="flex flex-col gap-2" style={{ width: '260px', flexShrink: 0 }}>

              {/* Mode tabs */}
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  type="button"
                  onClick={() => setPickTab('ai')}
                  className="flex-1 py-1.5 text-[11px] font-semibold transition-all"
                  style={{ background: pickTab === 'ai' ? 'rgba(20,184,166,0.2)' : 'transparent', color: pickTab === 'ai' ? '#5eead4' : '#71717a' }}
                >
                  🤖 AI Pick
                </button>
                <button
                  type="button"
                  onClick={() => { setPickTab('manual'); setLastPick(null); }}
                  className="flex-1 py-1.5 text-[11px] font-semibold transition-all"
                  style={{ background: pickTab === 'manual' ? 'rgba(139,92,246,0.2)' : 'transparent', color: pickTab === 'manual' ? '#c4b5fd' : '#71717a' }}
                >
                  📋 Manual
                </button>
              </div>

              {/* AI Pick: just-identified confirm card */}
              {pickTab === 'ai' && lastPick && (() => {
                const preset = COMPONENT_PRESETS.find(p => p.id === lastPick.component.presetId);
                return (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.3)' }}>
                    <p className="text-[10px] text-amber-400/70 uppercase tracking-wide font-semibold">AI Identified</p>
                    <div className="flex items-center gap-1.5">
                      <span>{preset?.emoji ?? '🔧'}</span>
                      <p className="text-xs font-semibold text-amber-300 truncate flex-1">{lastPick.component.name}</p>
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-600 mb-1">Quantity on board</label>
                      <input
                        type="number" min={1}
                        value={lastPickQty}
                        onChange={e => setLastPickQty(parseInt(e.target.value) || 1)}
                        className="input-field text-xs py-1 w-full"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={confirmLastPick}
                        className="flex-1 py-1.5 rounded-lg text-xs font-bold text-black"
                        style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)' }}>
                        ✓ Add
                      </button>
                      <button type="button" onClick={() => setLastPick(null)}
                        className="px-3 py-1.5 rounded-lg text-xs text-zinc-500"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        Skip
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* AI Pick: hint when idle */}
              {pickTab === 'ai' && !lastPick && (
                <div className="rounded-xl p-3 text-center text-[11px] text-zinc-600" style={{ border: '1px dashed rgba(20,184,166,0.2)' }}>
                  {picking ? '🤖 Identifying…' : 'Click on the board image to identify a component. Set qty, then add.'}
                </div>
              )}

              {/* Manual Add panel — 3-step flow */}
              {pickTab === 'manual' && (() => {
                const selectedPreset = COMPONENT_PRESETS.find(p => p.id === manualPreset) ?? COMPONENT_PRESETS[0];
                return (
                  <div className="rounded-xl p-3 space-y-3" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.25)' }}>

                    {/* Step indicators */}
                    <div className="flex items-center gap-1">
                      {([1,2,3] as const).map(s => (
                        <div key={s} className="flex items-center gap-1">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                            style={{
                              background: manualStep === s ? 'rgba(139,92,246,0.8)' : manualStep > s ? 'rgba(20,184,166,0.6)' : 'rgba(255,255,255,0.08)',
                              color: manualStep >= s ? 'white' : '#52525b',
                            }}>
                            {manualStep > s ? '✓' : s}
                          </div>
                          {s < 3 && <div className="flex-1 h-px" style={{ background: manualStep > s ? 'rgba(20,184,166,0.4)' : 'rgba(255,255,255,0.08)', width: '16px' }} />}
                        </div>
                      ))}
                      <span className="text-[10px] text-zinc-500 ml-1">
                        {manualStep === 1 ? 'Select component' : manualStep === 2 ? 'Enter quantity' : 'Click location on board'}
                      </span>
                    </div>

                    {/* Step 1: Component type */}
                    {manualStep === 1 && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-1">
                          {COMPONENT_PRESETS.map(p => (
                            <button key={p.id} type="button"
                              onClick={() => { setManualPreset(p.id); setManualName(''); }}
                              className="rounded-lg py-1.5 text-center text-[10px] font-semibold transition-all"
                              style={{
                                background: manualPreset === p.id ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${manualPreset === p.id ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.08)'}`,
                                color: manualPreset === p.id ? '#c4b5fd' : '#71717a',
                              }}>
                              <div>{p.emoji}</div>
                              <div className="truncate">{p.label}</div>
                            </button>
                          ))}
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-600 mb-1">Name (optional)</label>
                          <input type="text" value={manualName} onChange={e => setManualName(e.target.value)}
                            placeholder={selectedPreset.name} className="input-field text-xs py-1 w-full" />
                        </div>
                        <button type="button" onClick={() => setManualStep(2)}
                          className="w-full py-1.5 rounded-lg text-xs font-bold text-white"
                          style={{ background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' }}>
                          Next →
                        </button>
                      </div>
                    )}

                    {/* Step 2: Quantity */}
                    {manualStep === 2 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(139,92,246,0.1)' }}>
                          <span>{selectedPreset.emoji}</span>
                          <p className="text-xs font-semibold text-purple-300">{manualName || selectedPreset.name}</p>
                        </div>
                        <div>
                          <label className="block text-[10px] text-zinc-600 mb-1">How many on the board?</label>
                          <input type="number" min={1} value={manualQty}
                            onChange={e => setManualQty(parseInt(e.target.value) || 1)}
                            className="input-field text-sm py-2 w-full text-center font-bold" />
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setManualStep(1)}
                            className="px-3 py-1.5 rounded-lg text-xs text-zinc-500"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            ← Back
                          </button>
                          <button type="button" onClick={() => setManualStep(3)}
                            className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white"
                            style={{ background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' }}>
                            Next →
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Step 3: Click board to place numbered position markers */}
                    {manualStep === 3 && (
                      <div className="space-y-2">
                        {/* Component summary */}
                        <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'rgba(139,92,246,0.1)' }}>
                          <span>{selectedPreset.emoji}</span>
                          <p className="text-xs font-semibold text-purple-300">{manualName || selectedPreset.name}</p>
                          <span className="text-[10px] text-zinc-500 ml-auto">×{manualQty}</span>
                        </div>

                        {/* Progress indicator */}
                        <div className="rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-[11px] font-bold ${manualPositions.length === manualQty ? 'text-green-400' : manualPositions.length > manualQty ? 'text-red-400' : 'text-amber-400'}`}>
                              {manualPositions.length} / {manualQty} positions placed
                            </span>
                            {manualPositions.length > 0 && (
                              <button type="button" onClick={() => setManualPositions([])}
                                className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors">
                                Clear all
                              </button>
                            )}
                          </div>
                          {/* Dot progress row */}
                          <div className="flex flex-wrap gap-1">
                            {Array.from({ length: manualQty }).map((_, i) => (
                              <div key={i} className="w-2 h-2 rounded-full transition-colors"
                                style={{ background: i < manualPositions.length ? '#ef4444' : 'rgba(255,255,255,0.1)' }} />
                            ))}
                          </div>
                          {/* Placed markers list */}
                          {manualPositions.length > 0 && (
                            <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                              {manualPositions.map((pos, i) => (
                                <div key={i} className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                                  <div className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                                    style={{ background: '#ef4444' }}>
                                    {pos.label}
                                  </div>
                                  <span>({Math.round(pos.x * 100)}%, {Math.round(pos.y * 100)}%)</span>
                                  <button type="button"
                                    onClick={() => setManualPositions(prev => {
                                      const next = prev.filter((_, j) => j !== i);
                                      const prefix = (manualName.trim() || selectedPreset.name).charAt(0).toUpperCase();
                                      return next.map((p, j) => ({ ...p, label: `${prefix}${j + 1}` }));
                                    })}
                                    className="ml-auto text-zinc-600 hover:text-red-400 transition-colors">×</button>
                                </div>
                              ))}
                            </div>
                          )}
                          {manualPositions.length === 0 && (
                            <p className="text-[10px] text-purple-300/60 mt-1">
                              👆 Click on the board image (left) to place each marker
                            </p>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button type="button" onClick={() => { setManualStep(2); setManualPositions([]); }}
                            className="px-3 py-1.5 rounded-lg text-xs text-zinc-500"
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            ← Back
                          </button>
                          <button type="button"
                            disabled={manualPositions.length === 0}
                            onClick={() => {
                              const p = selectedPreset;
                              const id = Math.random().toString(36).slice(2);
                              const name = manualName.trim() || p.name;
                              const cx = manualPositions.length > 0 ? manualPositions[0].x : 0.5;
                              const cy = manualPositions.length > 0 ? manualPositions[0].y : 0.5;
                              setPickQueue(prev => [...prev, {
                                id,
                                x: cx, y: cy,
                                positions: [...manualPositions],
                                component: { presetId: p.id, name, expectedCount: manualQty, boardLocation: '', orientationRule: p.orientationRule, description: p.description, required: p.required },
                                qty: manualQty,
                              }]);
                              setManualName(''); setManualQty(1); setManualPositions([]); setManualStep(1);
                            }}
                            className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' }}>
                            + Add to list
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Divider if queue has items */}
              {pickQueue.length > 0 && (
                <p className="text-[10px] text-zinc-600 uppercase tracking-wide font-semibold px-1">
                  Queue ({pickQueue.length})
                </p>
              )}

              {/* Queue list */}
              {pickQueue.map((item, i) => {
                const preset = COMPONENT_PRESETS.find(p => p.id === item.component.presetId);
                return (
                  <div key={item.id} className="rounded-xl px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(20,184,166,0.15)' }}>
                    <span className="text-xs text-teal-400 font-bold w-4 shrink-0">{i + 1}</span>
                    <span className="text-sm shrink-0">{preset?.emoji ?? '🔧'}</span>
                    <p className="text-xs text-zinc-300 flex-1 truncate">{item.component.name}</p>
                    <input
                      type="number" min={1}
                      value={item.qty}
                      onChange={e => setPickQueue(prev => prev.map(q => q.id === item.id ? { ...q, qty: parseInt(e.target.value) || 1 } : q))}
                      className="input-field text-xs py-0.5 text-center"
                      style={{ width: '44px' }}
                    />
                    <button type="button"
                      onClick={() => setPickQueue(prev => prev.filter(q => q.id !== item.id))}
                      className="text-zinc-600 hover:text-red-400 text-sm leading-none shrink-0"
                    >×</button>
                  </div>
                );
              })}

              {/* Save all button */}
              {pickQueue.length > 0 && (
                <button
                  type="button"
                  onClick={savePickQueue}
                  disabled={savingQueue}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-black mt-1 transition-all"
                  style={{ background: savingQueue ? 'rgba(20,184,166,0.4)' : 'linear-gradient(135deg,#14b8a6,#0d9488)', opacity: savingQueue ? 0.7 : 1 }}
                >
                  {savingQueue ? 'Saving…' : `💾 Save ${pickQueue.length} component${pickQueue.length > 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AI Scan results review panel ──────────────────────────────────────── */}
      {scanResults && (
        <div className="card p-4 space-y-3" style={{ border: '1px solid rgba(139,92,246,0.25)', background: 'rgba(139,92,246,0.04)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-purple-300">🤖 AI detected {scanResults.length} component types</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Review counts and locations, then add all to the checklist.</p>
            </div>
            <button type="button" onClick={() => setScanResults(null)} className="text-zinc-600 hover:text-zinc-400 text-lg leading-none">×</button>
          </div>

          <div className="space-y-2">
            {scanResults.map((c, i) => {
              const preset = COMPONENT_PRESETS.find(p => p.id === c.presetId);
              return (
                <div key={i} className="rounded-xl p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(139,92,246,0.12)' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{preset?.emoji ?? '🔧'}</span>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-zinc-200">{c.name}</p>
                      {c.orientationRule && <p className="text-[10px] text-amber-400/70 mt-0.5">🔄 {c.orientationRule}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-600 mb-1">Quantity</label>
                      <input
                        type="number" min={1}
                        value={scanCounts[i] ?? c.expectedCount}
                        onChange={e => setScanCounts(prev => ({ ...prev, [i]: parseInt(e.target.value) || 1 }))}
                        className="input-field text-xs py-1"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-600 mb-1">Location</label>
                      <input
                        type="text"
                        value={scanLocations[i] ?? c.boardLocation}
                        onChange={e => setScanLocations(prev => ({ ...prev, [i]: e.target.value }))}
                        placeholder="e.g. TL,TR"
                        className="input-field text-xs py-1"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={addAllScanned}
              disabled={addingAll}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: addingAll ? 'rgba(139,92,246,0.4)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)', border: '1px solid rgba(139,92,246,0.4)' }}
            >
              {addingAll ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Adding…
                </span>
              ) : `✓ Add all ${scanResults.length} components to checklist`}
            </button>
            <button
              type="button"
              onClick={() => setScanResults(null)}
              className="px-4 py-2.5 rounded-xl text-sm text-zinc-500"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* ── Component checklist ───────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
            Components to verify ({stageItems.filter(i => i.active).length} active)
          </p>
          <div className="flex items-center gap-2">
            {/* Map on board button — only when there's a board ref image + components */}
            {boardRefItem?.referenceImageUrl && stageItems.filter(i => i.productId === activeProduct && !i.isBoardReference).length > 0 && (
              <button
                type="button"
                onClick={() => setShowMapper(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold transition-all"
                style={{ background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.3)', color: '#2dd4bf' }}
              >
                📍 Map on board
              </button>
            )}
            {stageItems.length > 0 && (
              <div className="text-[11px] text-zinc-600">
                Total: {stageItems.reduce((sum, i) => sum + (i.expectedCount ?? 1), 0)} parts
              </div>
            )}
          </div>
        </div>

        {stageItems.length === 0 && !showAdd && (
          <div className="card p-6 text-center space-y-1">
            <p className="text-zinc-500 text-sm">No components defined yet for this model.</p>
            {activeProduct === null && products.length > 1 && (
              <p className="text-zinc-600 text-xs">Global components apply to all product models.</p>
            )}
            {activeProduct !== null && (
              <p className="text-zinc-600 text-xs">
                These components are specific to{' '}
                <span className="text-sky-400">{products.find(p => p.id === activeProduct)?.name}</span>.
              </p>
            )}
          </div>
        )}

        {stageItems.map((item) => (
          <div
            key={item.id}
            className="card p-4 flex items-start gap-4"
            style={{ opacity: item.active ? 1 : 0.5 }}
          >
            {/* Reference image */}
            <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {item.referenceImageUrl ? (
                <Image src={blobImgUrl(item.referenceImageUrl)} alt={item.name} width={56} height={56} unoptimized className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{item.name}</span>
                {item.expectedCount && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-sky-400" style={{ background: 'rgba(14,165,233,0.1)' }}>
                    ×{item.expectedCount}
                  </span>
                )}
                {item.required && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-red-400" style={{ background: 'rgba(239,68,68,0.1)' }}>REQUIRED</span>
                )}
                {/* Show "Global" badge when viewing a product tab but item is inherited from global */}
                {activeProduct !== null && item.productId === null && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-purple-400" style={{ background: 'rgba(168,85,247,0.1)' }}>🌐 Global</span>
                )}
                {/* Mapped indicator */}
                {item.componentPositions && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-teal-400" style={{ background: 'rgba(20,184,166,0.1)' }}>
                    📍 {JSON.parse(item.componentPositions).length} mapped
                  </span>
                )}
                <span className="text-[10px] text-zinc-600">#{item.sortOrder}</span>
              </div>
              {item.boardLocation && (
                <p className="text-[11px] text-sky-400/70 mt-0.5 flex items-center gap-1">
                  <span>📍</span> {zonesToText(parseZoneIds(item.boardLocation)) || item.boardLocation}
                </p>
              )}
              {item.orientationRule && (
                <p className="text-[11px] text-amber-400/70 mt-0.5 flex items-center gap-1">
                  <span>🔄</span> {item.orientationRule}
                </p>
              )}
              {item.description && <p className="text-zinc-500 text-xs mt-0.5">{item.description}</p>}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => toggleActive(item)}
                className={`text-xs px-2 py-1 rounded-lg ${item.active ? 'text-green-400' : 'text-zinc-600'}`}
                style={{ background: item.active ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)' }}
              >
                {item.active ? 'Active' : 'Inactive'}
              </button>
              <button type="button" onClick={() => deleteItem(item.id)} className="text-zinc-600 hover:text-red-400 transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Add component form ────────────────────────────────────────────────── */}
      {showAdd && (
        <form onSubmit={handleAdd} className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              New component — {STAGES.find(s => s.key === activeStage)?.label}
              {activeProduct ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}>
                  {products.find(p => p.id === activeProduct)?.name}
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: '#c084fc' }}>
                  Global
                </span>
              )}
            </h3>
            {selectedPreset && (
              <button
                type="button"
                onClick={() => {
                  setSelectedPreset('');
                  setShowAdvanced(false);
                  setForm({ name: '', description: '', required: true, sortOrder: 0, expectedCount: '', orientationRule: '', boardLocation: '' });
                  setNewComponentPositions([]);
                }}
                className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                ← Change type
              </button>
            )}
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* ── Step 1: Pick component type ──────────────────────────────────── */}
          {!selectedPreset ? (
            <div className="space-y-3">
              <p className="text-[11px] text-zinc-500 uppercase tracking-widest">Pick component type</p>
              <div className="grid grid-cols-4 gap-2">
                {COMPONENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(preset.id);
                      setShowAdvanced(false);
                      setForm(f => ({
                        ...f,
                        name:            preset.name,
                        orientationRule: preset.orientationRule,
                        description:     preset.description,
                        required:        preset.required,
                        expectedCount:   '',   // user must always enter count
                        boardLocation:   '',   // user must always pick location
                      }));
                      setNewComponentPositions([]);
                    }}
                    className="flex flex-col items-center gap-1.5 rounded-xl py-3 px-2 transition-all hover:scale-105 active:scale-95"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <span className="text-xl leading-none">{preset.emoji}</span>
                    <span className="text-[10px] font-semibold text-zinc-400 leading-tight text-center">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Step 2: Simplified form ────────────────────────────────────── */
            <div className="space-y-4">
              {/* Preset header */}
              {selectedPreset !== 'custom' && (() => {
                const preset = COMPONENT_PRESETS.find(p => p.id === selectedPreset)!;
                return (
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                    style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}
                  >
                    <span className="text-lg">{preset.emoji}</span>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-sky-300">{preset.label} preset loaded</p>
                      {preset.orientationRule && (
                        <p className="text-[10px] text-zinc-500 mt-0.5">🔄 {preset.orientationRule}</p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Custom preset name field — shown only for "Custom" */}
              {selectedPreset === 'custom' && (
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Component name *</label>
                  <input
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. MOSFET IRFB4227, 4R7 Resistor, Gate Driver"
                    className="input-field text-sm"
                    autoFocus
                  />
                </div>
              )}

              {/* ── Key fields: count + sort order ───────────────────────────── */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">
                    Quantity on board *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={form.expectedCount}
                    onChange={e => setForm(f => ({ ...f, expectedCount: e.target.value }))}
                    placeholder="e.g. 18"
                    className="input-field text-sm"
                    autoFocus={selectedPreset !== 'custom'}
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">How many on this board?</p>
                </div>
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Sort order</label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                    className="input-field text-sm"
                  />
                </div>
              </div>

              {/* ── Board position picker (click on board image to mark each component) ── */}
              {boardRefItem?.referenceImageUrl ? (
                <div>
                  <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-2">
                    Component positions on board
                  </label>
                  <InlineBoardPicker
                    imageUrl={blobImgUrl(boardRefItem.referenceImageUrl)}
                    componentName={form.name || selectedPreset}
                    expectedCount={parseInt(form.expectedCount) || 0}
                    positions={newComponentPositions}
                    onChange={setNewComponentPositions}
                  />
                </div>
              ) : (
                <div
                  className="rounded-xl px-3 py-3 text-center"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' }}
                >
                  <p className="text-[11px] text-zinc-600">
                    📷 Upload a board reference image above to enable visual position marking
                  </p>
                </div>
              )}

              {/* ── Advanced / override section ───────────────────────────────── */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(v => !v)}
                  className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    style={{ transform: showAdvanced ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  Advanced / override rules
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Name override (only for non-custom presets) */}
                    {selectedPreset !== 'custom' && (
                      <div>
                        <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Component name</label>
                        <input
                          value={form.name}
                          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                          placeholder="Override preset name (e.g. MOSFET IRFB4227)"
                          className="input-field text-sm"
                        />
                        <p className="text-[10px] text-zinc-600 mt-1">Leave as-is or add part number for precision</p>
                      </div>
                    )}

                    {/* Orientation rule */}
                    <div>
                      <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Orientation rule</label>
                      <input
                        value={form.orientationRule}
                        onChange={e => setForm(f => ({ ...f, orientationRule: e.target.value }))}
                        placeholder="e.g. Heatsink tab must face outward from board centre"
                        className="input-field text-sm"
                      />
                    </div>

                    {/* Additional notes */}
                    <div>
                      <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">Additional notes for AI</label>
                      <textarea
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="Extra instructions for the AI inspector"
                        className="input-field text-sm resize-none"
                        rows={2}
                      />
                    </div>

                    {/* Required checkbox */}
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="required-adv"
                        checked={form.required}
                        onChange={e => setForm(f => ({ ...f, required: e.target.checked }))}
                        className="w-4 h-4 accent-sky-400"
                      />
                      <label htmlFor="required-adv" className="text-sm text-zinc-300 cursor-pointer">
                        Required — board fails if any issue found
                      </label>
                    </div>

                    {/* Component reference image */}
                    <div>
                      <label className="block text-[11px] text-zinc-500 uppercase tracking-wide mb-1">
                        Component reference image (optional)
                      </label>
                      <div
                        onClick={() => fileRef.current?.click()}
                        className="cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition-colors"
                        style={{ borderColor: previewUrl ? 'rgba(14,165,233,0.4)' : 'rgba(255,255,255,0.1)' }}
                      >
                        {previewUrl ? (
                          <Image src={previewUrl} alt="Preview" width={200} height={120} className="mx-auto rounded-lg object-cover max-h-32" />
                        ) : (
                          <p className="text-zinc-600 text-sm">Click to upload close-up of this component</p>
                        )}
                      </div>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedPreset && (
            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-primary flex-1 py-2.5 text-sm">
                {saving ? 'Saving…' : 'Add component'}
              </button>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setSelectedPreset(''); setShowAdvanced(false); setForm({ name: '', description: '', required: true, sortOrder: 0, expectedCount: '', orientationRule: '', boardLocation: '' }); setRefImage(null); setPreviewUrl(''); setNewComponentPositions([]); }}
                className="btn-ghost px-4 py-2.5 text-sm"
              >
                Cancel
              </button>
            </div>
          )}

          {!selectedPreset && (
            <button
              type="button"
              onClick={() => { setShowAdd(false); setSelectedPreset(''); }}
              className="w-full py-2 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              Cancel
            </button>
          )}
        </form>
      )}

      {!showAdd && (
        <div className="flex gap-2">
          {/* Manual add */}
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex-1 py-3 rounded-xl text-sm text-sky-400 font-medium transition-colors hover:brightness-125"
            style={{ background: 'rgba(14,165,233,0.08)', border: '1px dashed rgba(14,165,233,0.3)' }}
          >
            + Add component
          </button>
          {/* Bulk spreadsheet import */}
          <button
            type="button"
            onClick={() => bulkInputRef.current?.click()}
            className="flex-1 py-3 rounded-xl text-sm font-medium transition-colors hover:brightness-125"
            style={{ background: 'rgba(34,197,94,0.07)', border: '1px dashed rgba(34,197,94,0.3)', color: '#4ade80' }}
          >
            📊 Bulk upload spreadsheet
          </button>
          <button
            type="button"
            onClick={downloadTemplate}
            title="Download sample file (smx-checklist-sample.xlsx)"
            className="px-3 py-3 rounded-xl text-sm transition-colors hover:brightness-125"
            style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)', color: '#6b7280' }}
          >
            ⬇ Sample
          </button>
          <input
            ref={bulkInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.ods"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) parseSpreadsheet(f); e.target.value = ''; }}
          />
        </div>
      )}

      {/* ── Bulk import error ─────────────────────────────────────────────────── */}
      {bulkError && (
        <div className="rounded-xl p-3 text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          📊 {bulkError}
          <button onClick={() => setBulkError('')} className="ml-2 text-zinc-500 hover:text-white">×</button>
        </div>
      )}

      {/* ── Bulk import review table ──────────────────────────────────────────── */}
      {bulkRows && (
        <div className="card p-4 space-y-3" style={{ border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.03)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-green-300">
                📊 {bulkRows.filter(r => !r.error).length} components ready to import
                {bulkRows.some(r => r.error) && <span className="text-red-400 ml-2">({bulkRows.filter(r => r.error).length} skipped)</span>}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Review below — edit any row before importing.</p>
            </div>
            <button type="button" onClick={() => setBulkRows(null)} className="text-zinc-600 hover:text-zinc-400 text-lg">×</button>
          </div>

          {/* Column headers */}
          <div className="grid gap-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-widest px-1" style={{ gridTemplateColumns: '2fr 1fr 3fr 1fr 1fr' }}>
            <span>Name</span><span>Qty</span><span>Orientation rule</span><span>Location</span><span>Required</span>
          </div>

          <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
            {bulkRows.map((row, i) => row.error ? (
              <div key={i} className="rounded-lg px-3 py-2 text-xs text-red-400" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                ⚠ {row.error}
              </div>
            ) : (
              <div key={i} className="grid gap-1 items-center rounded-lg px-2 py-1.5" style={{ gridTemplateColumns: '2fr 1fr 3fr 1fr 1fr', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(34,197,94,0.08)' }}>
                <input
                  value={row.name}
                  onChange={e => setBulkRows(prev => prev!.map((r, j) => j === i ? { ...r, name: e.target.value } : r))}
                  className="input-field text-xs py-1 min-w-0"
                />
                <input
                  type="number" min={1}
                  value={row.expectedCount}
                  onChange={e => setBulkRows(prev => prev!.map((r, j) => j === i ? { ...r, expectedCount: parseInt(e.target.value) || 1 } : r))}
                  className="input-field text-xs py-1"
                />
                <input
                  value={row.orientationRule}
                  onChange={e => setBulkRows(prev => prev!.map((r, j) => j === i ? { ...r, orientationRule: e.target.value } : r))}
                  placeholder="Orientation rule…"
                  className="input-field text-xs py-1 min-w-0"
                />
                <input
                  value={row.boardLocation}
                  onChange={e => setBulkRows(prev => prev!.map((r, j) => j === i ? { ...r, boardLocation: e.target.value } : r))}
                  placeholder="TL,BR…"
                  className="input-field text-xs py-1 min-w-0"
                />
                <select
                  value={String(row.required)}
                  onChange={e => setBulkRows(prev => prev!.map((r, j) => j === i ? { ...r, required: e.target.value === 'true' } : r))}
                  className="input-field text-xs py-1"
                >
                  <option value="true">✓ Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={addAllBulk}
              disabled={bulkUploading}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: bulkUploading ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg,#16a34a,#15803d)', border: '1px solid rgba(34,197,94,0.4)' }}
            >
              {bulkUploading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Uploading…
                </span>
              ) : `✓ Import ${bulkRows.filter(r => !r.error && r.name).length} components`}
            </button>
            <button
              type="button"
              onClick={() => setBulkRows(null)}
              className="px-4 py-2.5 rounded-xl text-sm text-zinc-500"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Summary card */}
      {stageItems.length > 0 && (
        <div className="card p-4 space-y-2" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">AI Inspection Summary</p>
          <div className="space-y-1">
            {stageItems.filter(i => i.active).map(item => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-600">•</span>
                <span className="text-zinc-300 font-medium">{item.name}</span>
                {item.expectedCount && (
                  <span className="text-sky-400">×{item.expectedCount}</span>
                )}
                {item.boardLocation && (
                  <span className="text-sky-400/60 truncate">📍 {zonesToText(parseZoneIds(item.boardLocation)) || item.boardLocation}</span>
                )}
                {item.orientationRule && (
                  <span className="text-amber-400/60 truncate">🔄 {item.orientationRule}</span>
                )}
                {item.required && (
                  <span className="ml-auto text-[10px] text-red-400 shrink-0">REQUIRED</span>
                )}
              </div>
            ))}
          </div>
          <div className="pt-1 border-t border-zinc-800 flex items-center justify-between text-[11px]">
            <span className="text-zinc-600">Total parts expected per board</span>
            <span className="font-bold text-white">{stageItems.filter(i => i.active).reduce((sum, i) => sum + (i.expectedCount ?? 1), 0)}</span>
          </div>
        </div>
      )}

      {/* ── Board Mapper modal ────────────────────────────────────────────────── */}
      {showMapper && boardRefItem?.referenceImageUrl && (
        <BoardMapper
          imageUrl={blobImgUrl(boardRefItem.referenceImageUrl)}
          components={stageItems
            .filter((i) => i.productId === activeProduct && !i.isBoardReference && i.active)
            .map((i) => ({ id: i.id, name: i.name, count: i.expectedCount ?? 1 }))}
          initialMarkers={stageItems
            .filter((i) => i.productId === activeProduct && i.componentPositions)
            .map((i) => ({
              componentId: i.id,
              name: i.name,
              color: '#ffffff',
              positions: JSON.parse(i.componentPositions!),
            }))}
          onSave={savePositions}
          onClose={() => setShowMapper(false)}
        />
      )}
    </div>
  );
}
