'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, ChevronRight, Clock, Printer, ChevronDown, Camera, Bot, Bluetooth, Upload, AlertTriangle, Loader2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type QCUnit = {
  id: string;
  serialNumber: string;
  currentStatus: string;
  updatedAt: string;
  assemblyBarcode: string | null;
  qcBarcode: string | null;
  productId: string;
  assignedTo: { id: string; name: string } | null;
  reworkRecord: { id: string; cycleCount: number; createdAt: string } | null;
  order: {
    id: string;
    orderNumber: string;
    product: { id: string; name: string; code: string };
  } | null;
};

type CompletedUnit = QCUnit & {
  qcResult:        'PASS' | 'FAIL';
  qcPassedBy:     { id: string; name: string } | null;
  firmwareVersion: string | null;
  softwareVersion: string | null;
  checklistData:   Record<string, unknown> | null;
  hadRework:       boolean;
};

// ─── Dynamic QC Test Item types ──────────────────────────────────────────────

type QCTestParam = {
  id: string;
  name: string;
  label: string | null;
  unit: string | null;
  minValue: number | null;
  maxValue: number | null;
  matchTolerance: number | null;
  matchParamId: string | null;
  isWriteParam: boolean;
  hardBlock: boolean;
  sortOrder: number;
};

type QCTestItem = {
  id: string;
  productId: string;
  name: string;
  sortOrder: number;
  requirePhoto: boolean;
  aiExtract: boolean;
  params: QCTestParam[];
};

type TestItemResult = {
  testItemId: string;
  status: 'PASS' | 'FAIL' | null;
  photoUrl: string | null;
  paramValues: Record<string, number | string | null>;
  bluetoothCode?: string;
};

type Phase = 'verify' | 'idle' | 'starting' | 'checklist' | 'summary' | 'submitting' | 'done';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function elapsed(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Status badge config ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:       { label: 'Pending',     color: '#94a3b8', bg: 'rgba(148,163,184,0.10)' },
  IN_PROGRESS:   { label: 'In Progress', color: '#38bdf8', bg: 'rgba(56,189,248,0.10)'  },
  REJECTED_BACK: { label: 'Rework',      color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
};

// ─── Issue/Fail types ─────────────────────────────────────────────────────────

type IssueCategory = { id: string; code: string; name: string };

const SOURCE_STAGE_OPTIONS = [
  { value: 'POWERSTAGE_MANUFACTURING', label: 'Powerstage Manufacturing' },
  { value: 'BRAINBOARD_MANUFACTURING', label: 'Brainboard Manufacturing' },
  { value: 'CONTROLLER_ASSEMBLY',      label: 'Controller Assembly'      },
  { value: 'QC_AND_SOFTWARE',          label: 'QC & Software'            },
];

// ─── Bluetooth Helper ─────────────────────────────────────────────────────────

async function scanBluetooth(): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bt = (navigator as any).bluetooth;
    if (!bt) return null;
    const device = await bt.requestDevice({
      acceptAllDevices: true,
    });
    const name = device.name ?? device.id ?? '';
    // Extract last 4 characters as the Bluetooth code
    return name.slice(-4) || name;
  } catch {
    return null;
  }
}

// ─── Tolerance validation ─────────────────────────────────────────────────────

function validateParam(
  param: QCTestParam,
  value: number | string | null,
  allValues: Record<string, number | string | null>
): { ok: boolean; reason?: string } {
  if (value === null || value === '' || value === undefined) {
    return { ok: true }; // empty = not checked
  }
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return { ok: true };

  // Range check
  if (param.minValue != null && num < param.minValue) {
    return { ok: false, reason: `Below min ${param.minValue}${param.unit ? ' ' + param.unit : ''}` };
  }
  if (param.maxValue != null && num > param.maxValue) {
    return { ok: false, reason: `Above max ${param.maxValue}${param.unit ? ' ' + param.unit : ''}` };
  }

  // Match tolerance check (e.g. R must match Motor Resistance ±0.50)
  if (param.matchTolerance != null && param.matchParamId) {
    const matchVal = allValues[param.matchParamId];
    if (matchVal !== null && matchVal !== '' && matchVal !== undefined) {
      const matchNum = typeof matchVal === 'string' ? parseFloat(matchVal) : matchVal;
      if (!isNaN(matchNum) && Math.abs(num - matchNum) > param.matchTolerance) {
        return { ok: false, reason: `Differs from matched param by ${Math.abs(num - matchNum).toFixed(2)} (max ±${param.matchTolerance})` };
      }
    }
  }

  return { ok: true };
}

// ─── Inline QC Checklist (new dynamic version) ──────────────────────────────

function InlineQCChecklist({ unit, onDone }: { unit: QCUnit; onDone: () => void }) {
  const router = useRouter();

  // Phase management
  const [phase, setPhase] = useState<Phase>(
    unit.currentStatus === 'IN_PROGRESS' ? 'checklist' : 'verify'
  );
  const [scanInput, setScanInput] = useState('');
  const [scanError, setScanError] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  // Dynamic test items from API
  const [testItems, setTestItems] = useState<QCTestItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [results, setResults] = useState<Record<string, TestItemResult>>({});

  // Photo upload state
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Fail details
  const [firmwareVersion, setFirmwareVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [issueCategories, setIssueCategories] = useState<IssueCategory[]>([]);
  const [issueCategoryId, setIssueCategoryId] = useState('');
  const [sourceStage, setSourceStage] = useState('');
  const [failRemarks, setFailRemarks] = useState('');

  // Bluetooth state
  const [btScanning, setBtScanning] = useState(false);

  // Load test items for this product
  useEffect(() => {
    const productId = unit.order?.product?.id ?? unit.productId;
    if (!productId) { setLoadingItems(false); return; }
    fetch(`/api/admin/qc-tests?productId=${productId}`)
      .then(r => r.ok ? r.json() : [])
      .then((items: QCTestItem[]) => setTestItems(items))
      .catch(() => {})
      .finally(() => setLoadingItems(false));
  }, [unit.order?.product?.id, unit.productId]);

  // Load issue categories
  useEffect(() => {
    fetch('/api/qc/issue-categories')
      .then(r => r.ok ? r.json() : [])
      .then((d: IssueCategory[]) => setIssueCategories(d))
      .catch(() => {});
  }, []);

  const currentItem = testItems[currentIdx] ?? null;
  const completedCount = Object.keys(results).length;

  // Get or create result for current item
  const getCurrentResult = (): TestItemResult => {
    if (!currentItem) return { testItemId: '', status: null, photoUrl: null, paramValues: {} };
    return results[currentItem.id] ?? {
      testItemId: currentItem.id,
      status: null,
      photoUrl: null,
      paramValues: {},
    };
  };

  const updateResult = (itemId: string, updates: Partial<TestItemResult>) => {
    setResults(prev => ({
      ...prev,
      [itemId]: { ...getCurrentResult(), ...prev[itemId], ...updates, testItemId: itemId },
    }));
  };

  // All param values across all items (for match tolerance)
  const allParamValues: Record<string, number | string | null> = {};
  Object.values(results).forEach(r => {
    Object.entries(r.paramValues).forEach(([k, v]) => { allParamValues[k] = v; });
  });

  // Photo upload + AI extraction
  const handlePhotoUpload = async (file: File) => {
    if (!currentItem) return;
    setUploading(true);
    setExtracting(currentItem.aiExtract);
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('testItemId', currentItem.id);

      const res = await fetch(`/api/units/${unit.id}/qc-photo`, { method: 'POST', body: form });
      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json() as {
        photoUrl: string;
        extractedValues: Record<string, number | null> | null;
        confidence?: string;
      };

      // Update result with photo URL and AI-extracted values
      const updates: Partial<TestItemResult> = { photoUrl: data.photoUrl };
      if (data.extractedValues) {
        const existing = results[currentItem.id]?.paramValues ?? {};
        const merged = { ...existing };
        // Map extracted values to param IDs
        for (const param of currentItem.params) {
          if (data.extractedValues[param.name] !== undefined) {
            merged[param.id] = data.extractedValues[param.name];
          }
        }
        updates.paramValues = merged;
      }
      updateResult(currentItem.id, updates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  };

  // Bluetooth scan
  const handleBluetoothScan = async () => {
    if (!currentItem) return;
    setBtScanning(true);
    try {
      const code = await scanBluetooth();
      if (code) {
        updateResult(currentItem.id, { bluetoothCode: code });
      } else {
        setError('Could not read Bluetooth device');
      }
    } catch {
      setError('Bluetooth scan failed — check browser support');
    } finally {
      setBtScanning(false);
    }
  };

  // Validate current item has all required data
  const validateCurrentItem = (): { valid: boolean; hardFails: string[] } => {
    if (!currentItem) return { valid: false, hardFails: [] };
    const result = getCurrentResult();
    const hardFails: string[] = [];

    // Check photo required
    if (currentItem.requirePhoto && !result.photoUrl) {
      return { valid: false, hardFails: ['Photo required'] };
    }

    // Check each param
    for (const param of currentItem.params) {
      const val = result.paramValues[param.id];
      if (param.isWriteParam && (val === null || val === '' || val === undefined)) {
        return { valid: false, hardFails: [`"${param.label || param.name}" value required (write param)`] };
      }
      const check = validateParam(param, val, allParamValues);
      if (!check.ok && param.hardBlock) {
        hardFails.push(`${param.label || param.name}: ${check.reason}`);
      }
    }

    return { valid: true, hardFails };
  };

  // Mark current item pass/fail and move to next
  const markCurrentItem = (status: 'PASS' | 'FAIL') => {
    if (!currentItem) return;
    const { valid, hardFails } = validateCurrentItem();
    if (!valid) {
      setError(hardFails[0] || 'Complete all required fields');
      return;
    }

    // If hard blocks exist, force FAIL
    const finalStatus = hardFails.length > 0 ? 'FAIL' : status;
    updateResult(currentItem.id, { status: finalStatus });
    setError(null);

    if (currentIdx < testItems.length - 1) {
      setCurrentIdx(i => i + 1);
    } else {
      setPhase('summary');
    }
  };

  // Edit a previous item
  const editItem = (idx: number) => {
    setCurrentIdx(idx);
    setPhase('checklist');
    setError(null);
  };

  // Start QC
  async function startQC() {
    setPhase('starting');
    setError(null);
    try {
      const res = await fetch(`/api/units/${unit.id}/work`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? 'Failed to start QC');
      }
      setPhase('checklist');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error starting QC');
      setPhase('idle');
    }
  }

  // Submit final result
  async function submitResult(result: 'PASS' | 'FAIL') {
    if (result === 'FAIL') {
      if (!issueCategoryId) { setError('Select an error code before submitting FAIL'); return; }
      if (!sourceStage)     { setError('Select the defect origin stage before submitting FAIL'); return; }
      if (!failRemarks.trim()) { setError('Describe the defect before submitting FAIL'); return; }
    }
    setPhase('submitting');
    setError(null);

    // Build checklistData in new format
    const checklistData: Record<string, unknown> = {};
    for (const item of testItems) {
      const r = results[item.id];
      if (r) {
        checklistData[item.id] = {
          name: item.name,
          status: r.status,
          photoUrl: r.photoUrl,
          paramValues: r.paramValues,
          bluetoothCode: r.bluetoothCode,
        };
      }
    }

    // Collect bluetooth code from any Bluetooth test item
    let btCode: string | undefined;
    for (const r of Object.values(results)) {
      if (r.bluetoothCode) { btCode = r.bluetoothCode; break; }
    }

    try {
      const res = await fetch(`/api/units/${unit.id}/qc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result,
          checklistData,
          firmwareVersion: firmwareVersion || undefined,
          bluetoothCode: btCode,
          issueCategoryId: result === 'FAIL' ? issueCategoryId : undefined,
          sourceStage:     result === 'FAIL' ? sourceStage : undefined,
          remarks:         result === 'FAIL' ? failRemarks.trim() : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? 'Submission failed');
      }
      setPhase('done');
      router.refresh();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error submitting');
      setPhase('summary');
    }
  }

  const card = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 20,
  };

  // ── Done phase ──
  if (phase === 'done') {
    return (
      <div style={card} className="text-center py-6">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
          <Check className="w-6 h-6 text-green-400" />
        </div>
        <p className="text-white font-semibold text-base">QC Submitted</p>
        <p className="text-zinc-500 text-sm mt-1">{unit.serialNumber}</p>
        <button onClick={onDone} className="mt-4 px-5 py-2 rounded-xl text-xs font-semibold"
          style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.2)', color: '#38bdf8' }}>
          Back to Queue
        </button>
      </div>
    );
  }

  // ── Barcode scan verification ──
  const isReworkUnit = unit.currentStatus === 'REJECTED_BACK';
  const isManualEntry = !unit.assemblyBarcode && !unit.qcBarcode;
  const expectedBarcode = isManualEntry
    ? unit.serialNumber
    : isReworkUnit
      ? (unit.qcBarcode ?? unit.assemblyBarcode)
      : (unit.assemblyBarcode ?? unit.qcBarcode);

  function handleScanVerify() {
    const entered = scanInput.trim();
    if (!entered) { setScanError('Scan or enter the barcode'); scanRef.current?.focus(); return; }
    if (expectedBarcode && entered !== expectedBarcode) {
      setScanError(isManualEntry
        ? 'Serial number mismatch — please enter the correct serial number'
        : 'Barcode mismatch — please scan the correct unit');
      setScanInput('');
      scanRef.current?.focus();
      return;
    }
    setScanError(null);
    setPhase('idle');
  }

  const verifyTitle = isManualEntry
    ? 'Scan Barcode'
    : isReworkUnit ? 'Scan QC Barcode' : 'Scan Assembly Barcode';
  const verifyDesc = isManualEntry
    ? 'Scan the barcode on the Unit to proceed.'
    : isReworkUnit
      ? 'Scan the QC barcode sticker on the unit from the previous test.'
      : 'Scan the assembly barcode label on the physical unit to confirm you have the correct unit.';

  if (phase === 'verify') {
    return (
      <div style={card}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-400 mb-3">Unit Verification</p>
        <h3 className="text-base font-semibold text-white mb-1">{verifyTitle}</h3>
        <p className="text-zinc-500 text-sm mb-5">{verifyDesc}</p>
        <div className="rounded-xl p-3 mb-5"
          style={{ background: 'rgba(14,165,233,0.05)', border: '1px solid rgba(14,165,233,0.15)' }}>
          <p className="text-[10px] text-zinc-500 mb-1">
            {isManualEntry ? 'Enter this serial number' : 'Scan this barcode'}
          </p>
          <p className="font-mono text-base font-bold mb-0.5"
            style={{ color: isManualEntry ? '#fbbf24' : isReworkUnit ? '#34d399' : '#38bdf8' }}>
            {expectedBarcode}
          </p>
          {!isManualEntry && (
            <p className="font-mono text-[10px] text-zinc-500">{unit.serialNumber}</p>
          )}
          <p className="text-xs text-zinc-500 mt-0.5">{unit.order?.product.name} · {unit.order?.orderNumber}</p>
        </div>
        <label className="block text-xs text-zinc-500 mb-1.5">
          {isManualEntry ? 'Serial Number' : 'Scan Result'}
        </label>
        <input
          ref={scanRef}
          autoFocus
          type="text"
          value={scanInput}
          onChange={(e) => { setScanInput(e.target.value); setScanError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleScanVerify(); }}
          placeholder={isManualEntry ? `Enter ${expectedBarcode}…` : `Scan ${expectedBarcode}…`}
          className="w-full px-3 py-3 rounded-xl text-sm text-white placeholder-zinc-700 outline-none mb-3 font-mono"
          style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${scanError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}` }}
        />
        {scanError && <p className="text-red-400 text-sm mb-3">{scanError}</p>}
        <button onClick={handleScanVerify}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity"
          style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}>
          Verify &amp; Proceed
        </button>
      </div>
    );
  }

  // ── Idle / Starting ──
  if (phase === 'idle' || phase === 'starting') {
    const isRework = unit.currentStatus === 'REJECTED_BACK';
    return (
      <div style={card}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-400 mb-3">QC &amp; Software Test</p>
        <h3 className="text-base font-semibold text-white mb-1">Quality Control Checklist</h3>
        {loadingItems ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading test items...
          </div>
        ) : testItems.length === 0 ? (
          <p className="text-amber-400 text-sm py-4">
            No QC test items configured for this product. Ask admin to set up QC tests.
          </p>
        ) : (
          <>
            <p className="text-zinc-500 text-sm mb-4">{testItems.length} test item{testItems.length !== 1 ? 's' : ''}</p>
            <div className="space-y-1.5 mb-5">
              {testItems.map((item, i) => (
                <div key={item.id} className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="text-zinc-600 w-5 text-right">{i + 1}.</span>
                  <span className="text-zinc-300">{item.name}</span>
                  <div className="flex items-center gap-1 ml-auto">
                    {item.requirePhoto && <Camera className="w-3 h-3 text-sky-400" />}
                    {item.aiExtract && <Bot className="w-3 h-3 text-violet-400" />}
                    <span className="text-zinc-600">{item.params.length}p</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="rounded-xl p-3 mb-4"
          style={{
            background: isRework ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.05)',
            border: `1px solid ${isRework ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.2)'}`,
          }}>
          <div className="flex items-start gap-3">
            <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: isRework ? '#f87171' : '#4ade80' }} />
            <div className="flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: isRework ? '#f87171' : '#4ade80' }}>Unit</p>
              <p className="font-mono text-sm text-white">{unit.serialNumber}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{unit.order?.product.name ?? '—'} · {unit.order?.orderNumber ?? '—'}</p>
            </div>
            {isRework && (
              <span className="text-[9px] font-bold px-2 py-1 rounded uppercase tracking-widest"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                Rework
              </span>
            )}
          </div>
        </div>
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <button onClick={startQC} disabled={phase === 'starting' || testItems.length === 0}
          className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 transition-opacity"
          style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', color: '#38bdf8' }}>
          {phase === 'starting' ? 'Starting…' : isRework ? 'Re-run QC Test' : 'Start QC Test'}
        </button>
      </div>
    );
  }

  // ── Checklist phase — one test item at a time ──
  if (phase === 'checklist' && currentItem) {
    const result = getCurrentResult();
    const isBluetooth = currentItem.name.toLowerCase().includes('bluetooth');
    const { hardFails } = validateCurrentItem();

    return (
      <div style={card}>
        {/* Progress */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-zinc-500">{currentIdx + 1} / {testItems.length}</span>
          <span className="text-xs text-zinc-600">QC in progress</span>
        </div>
        <div className="h-1.5 rounded-full mb-5 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(currentIdx / testItems.length) * 100}%`, background: '#38bdf8' }} />
        </div>

        {/* Test item name */}
        <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Test Item</p>
        <p className="text-2xl font-bold text-white mb-1">{currentItem.name}</p>
        <div className="flex items-center gap-2 mb-4">
          {currentItem.requirePhoto && (
            <span className="flex items-center gap-1 text-[10px] text-sky-400">
              <Camera className="w-3 h-3" /> Photo required
            </span>
          )}
          {currentItem.aiExtract && (
            <span className="flex items-center gap-1 text-[10px] text-violet-400">
              <Bot className="w-3 h-3" /> AI auto-fill
            </span>
          )}
        </div>

        {/* Photo upload section */}
        {currentItem.requirePhoto && (
          <div className="mb-4">
            {result.photoUrl ? (
              <div className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <Check className="w-4 h-4 text-green-400 shrink-0" />
                <span className="text-sm text-green-400">Photo uploaded</span>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="ml-auto text-xs text-sky-400 hover:text-sky-300"
                >
                  Replace
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full py-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'rgba(14,165,233,0.08)', border: '1px dashed rgba(14,165,233,0.3)', color: '#38bdf8' }}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {extracting ? 'AI reading values...' : 'Uploading...'}
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" /> Upload Photo
                  </>
                )}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePhotoUpload(f);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {/* Bluetooth scan section */}
        {isBluetooth && (
          <div className="mb-4">
            {result.bluetoothCode ? (
              <div className="flex items-center gap-3 p-3 rounded-xl"
                style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)' }}>
                <Bluetooth className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-sm text-white font-mono">{result.bluetoothCode}</span>
                <button onClick={handleBluetoothScan} disabled={btScanning}
                  className="ml-auto text-xs text-sky-400 hover:text-sky-300">
                  Re-scan
                </button>
              </div>
            ) : (
              <button
                onClick={handleBluetoothScan}
                disabled={btScanning}
                className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: '#60a5fa' }}
              >
                {btScanning ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Scanning...</>
                ) : (
                  <><Bluetooth className="w-4 h-4" /> Scan Bluetooth Device</>
                )}
              </button>
            )}
          </div>
        )}

        {/* Parameter fields */}
        {currentItem.params.length > 0 && (
          <div className="space-y-3 mb-4">
            {currentItem.params.map(param => {
              const val = result.paramValues[param.id] ?? '';
              const validation = validateParam(param, val, allParamValues);
              const isWrite = param.isWriteParam;
              return (
                <div key={param.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <label className="text-xs text-zinc-400">
                      {param.label || param.name}
                      {param.unit && <span className="text-zinc-600 ml-1">({param.unit})</span>}
                    </label>
                    {isWrite && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        WRITE
                      </span>
                    )}
                    {param.hardBlock && (
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                    )}
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={val === null ? '' : val}
                    onChange={e => {
                      const v = e.target.value;
                      updateResult(currentItem.id, {
                        paramValues: { ...result.paramValues, [param.id]: v === '' ? null : v },
                      });
                      setError(null);
                    }}
                    onWheel={e => (e.target as HTMLElement).blur()}
                    placeholder={
                      param.minValue != null && param.maxValue != null
                        ? `${param.minValue} – ${param.maxValue}`
                        : 'Enter value…'
                    }
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-zinc-700 outline-none font-mono"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: `1px solid ${!validation.ok ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    }}
                  />
                  {!validation.ok && (
                    <p className="text-red-400 text-[10px] mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {validation.reason}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Hard block warnings */}
        {hardFails.length > 0 && (
          <div className="rounded-xl p-3 mb-4"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">Hard Block</p>
            {hardFails.map((f, i) => (
              <p key={i} className="text-xs text-red-300">{f}</p>
            ))}
          </div>
        )}

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        {/* Pass / Fail buttons */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => markCurrentItem('PASS')}
            disabled={hardFails.length > 0}
            className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-30"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
            <Check className="w-4 h-4" /> Pass
          </button>
          <button
            onClick={() => markCurrentItem('FAIL')}
            className="flex-1 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
            <X className="w-4 h-4" /> Fail
          </button>
        </div>

        {/* Completed items below */}
        {currentIdx > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">Completed</p>
            {testItems.slice(0, currentIdx).map((item, idx) => {
              const r = results[item.id];
              return (
                <button key={item.id} onClick={() => editItem(idx)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs hover:bg-white/5"
                  style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
                  <span className="text-zinc-400">{item.name}</span>
                  <div className="flex items-center gap-2">
                    {r?.photoUrl && <Camera className="w-3 h-3 text-sky-400" />}
                    <span className={r?.status === 'FAIL' ? 'text-red-400 font-semibold' : 'text-green-400 font-semibold'}>
                      {r?.status ?? '—'}
                    </span>
                    <span className="text-[10px] text-zinc-600">edit</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Summary / Submitting ──
  if (phase === 'summary' || phase === 'submitting') {
    const failCount = testItems.filter(i => results[i.id]?.status === 'FAIL').length;
    const hasFailItems = failCount > 0;
    const canSubmitFail = issueCategoryId && sourceStage && failRemarks.trim();

    return (
      <div style={card}>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-4">Review &amp; Submit</p>

        {/* Firmware version */}
        <div className="mb-4">
          <label className="block text-xs mb-1" style={{ color: firmwareVersion.trim() ? '#94a3b8' : '#f87171' }}>
            Firmware Version <span className="text-red-400">*</span>
          </label>
          <input type="text" value={firmwareVersion} onChange={(e) => setFirmwareVersion(e.target.value)}
            placeholder="e.g. v2.4.1" className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-zinc-700 outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${firmwareVersion.trim() ? 'rgba(255,255,255,0.1)' : 'rgba(239,68,68,0.4)'}` }} />
        </div>

        {/* Test items summary */}
        <div className="rounded-xl overflow-hidden mb-4" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          {testItems.map((item, idx) => {
            const r = results[item.id];
            const status = r?.status;
            return (
              <div key={item.id}
                className={`flex items-center justify-between px-3 py-2.5 text-xs ${idx > 0 ? 'border-t' : ''}`}
                style={idx > 0 ? { borderColor: 'rgba(255,255,255,0.05)' } : undefined}>
                <button onClick={() => editItem(idx)} className="text-zinc-400 hover:text-white transition-colors text-left flex items-center gap-2">
                  {item.name}
                  {r?.photoUrl && <Camera className="w-3 h-3 text-sky-400" />}
                  {r?.bluetoothCode && <Bluetooth className="w-3 h-3 text-blue-400" />}
                </button>
                <div className="flex items-center gap-2">
                  {/* Show param summary */}
                  {item.params.length > 0 && r && (
                    <span className="text-[10px] text-zinc-600">
                      {item.params.filter(p => r.paramValues[p.id] != null && r.paramValues[p.id] !== '').length}/{item.params.length}
                    </span>
                  )}
                  <span className={
                    status === 'PASS' ? 'text-green-400 font-semibold' :
                    status === 'FAIL' ? 'text-red-400 font-semibold' :
                    'text-zinc-600'
                  }>
                    {status ?? '—'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Fail details — mandatory when any item failed */}
        {hasFailItems && (
          <div className="rounded-xl p-4 mb-4 space-y-3"
            style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1">
              Fail Details — Required
            </p>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: issueCategoryId ? '#94a3b8' : '#f87171' }}>
                Error Code <span className="text-red-400">*</span>
              </label>
              <select value={issueCategoryId} onChange={(e) => { setIssueCategoryId(e.target.value); setError(null); }}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${issueCategoryId ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.4)'}`,
                }}>
                <option value="" disabled style={{ background: '#1e293b' }}>Select error code…</option>
                {issueCategories.map((c) => (
                  <option key={c.id} value={c.id} style={{ background: '#1e293b' }}>[{c.code}] {c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1" style={{ color: sourceStage ? '#94a3b8' : '#f87171' }}>
                Defect Origin Stage <span className="text-red-400">*</span>
              </label>
              <p className="text-[10px] text-zinc-600 mb-1.5">Which stage introduced this defect?</p>
              <select value={sourceStage} onChange={(e) => { setSourceStage(e.target.value); setError(null); }}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${sourceStage ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.4)'}`,
                }}>
                <option value="" disabled style={{ background: '#1e293b' }}>Select origin stage…</option>
                {SOURCE_STAGE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value} style={{ background: '#1e293b' }}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1.5" style={{ color: failRemarks.trim() ? '#94a3b8' : '#f87171' }}>
                Defect Description <span className="text-red-400">*</span>
              </label>
              <textarea
                value={failRemarks}
                onChange={(e) => { setFailRemarks(e.target.value); setError(null); }}
                placeholder="Describe the defect in detail…"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-zinc-700 outline-none resize-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${failRemarks.trim() ? 'rgba(255,255,255,0.12)' : 'rgba(239,68,68,0.4)'}`,
                }}
              />
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => submitResult('PASS')} disabled={phase === 'submitting' || !firmwareVersion.trim()}
            className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }}>
            <Check className="w-4 h-4" />
            {phase === 'submitting' ? 'Submitting…' : 'Submit PASS'}
          </button>
          <button
            onClick={() => submitResult('FAIL')}
            disabled={phase === 'submitting' || (hasFailItems && !canSubmitFail)}
            className="flex-1 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5"
            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
            <X className="w-4 h-4" />
            Submit FAIL
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Order Group (full-width accordion for pending/processing tabs) ──────────

type OrderGroup = {
  orderId:     string;
  orderNumber: string;
  productName: string;
  units:       QCUnit[];
};

function groupByOrder(units: QCUnit[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();
  for (const u of units) {
    const key = u.order?.id ?? '__unknown__';
    if (!map.has(key)) {
      map.set(key, {
        orderId:     u.order?.id ?? '',
        orderNumber: u.order?.orderNumber ?? 'Unknown Order',
        productName: u.order?.product.name ?? '—',
        units: [],
      });
    }
    map.get(key)!.units.push(u);
  }
  return Array.from(map.values());
}

function OrderGroupAccordion({ group, onSelect }: { group: OrderGroup; onSelect: (u: QCUnit) => void }) {
  const reworkCount = group.units.filter((u) => u.currentStatus === 'REJECTED_BACK').length;
  const activeCount  = group.units.filter((u) => u.currentStatus === 'IN_PROGRESS').length;

  return (
    <div className="rounded-xl overflow-hidden w-full" style={{ border: '1px solid rgba(255,255,255,0.10)' }}>
      {/* Order header */}
      <div className="w-full flex items-center gap-3 px-4 py-2.5"
        style={{ background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-white">{group.orderNumber}</span>
          <span className="text-xs text-zinc-400">{group.productName}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {reworkCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
              {reworkCount} rework
            </span>
          )}
          {activeCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(56,189,248,0.12)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.2)' }}>
              {activeCount} active
            </span>
          )}
          <span className="text-[10px] text-zinc-500">{group.units.length} unit{group.units.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Unit rows */}
      <div>
        {group.units.map((u, i) => (
          <div key={u.id} style={i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.05)' } : undefined}>
            <UnitRow unit={u} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Unit Row (inside order accordion) ───────────────────────────────────────

function UnitRow({ unit, onSelect }: { unit: QCUnit; onSelect: (u: QCUnit) => void }) {
  const isRework = unit.currentStatus === 'REJECTED_BACK';
  const isActive = unit.currentStatus === 'IN_PROGRESS';
  const accentColor = isRework ? '#f87171' : isActive ? '#38bdf8' : '#94a3b8';
  const badge = STATUS_BADGE[unit.currentStatus] ?? STATUS_BADGE.PENDING;
  const reworkShortId = unit.reworkRecord
    ? 'RW-' + unit.reworkRecord.id.slice(-6).toUpperCase()
    : null;

  return (
    <button type="button" onClick={() => onSelect(unit)}
      className="w-full text-left flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]">
      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accentColor }} />
      <div className="flex flex-col min-w-0">
        {isRework && reworkShortId ? (
          <>
            <p className="font-mono text-sm font-semibold leading-tight" style={{ color: '#f87171' }}>{reworkShortId}</p>
            <p className="font-mono text-[10px] text-zinc-500 leading-tight">{unit.serialNumber}</p>
          </>
        ) : (
          <p className="font-mono text-sm font-semibold text-white leading-tight">{unit.serialNumber}</p>
        )}
      </div>
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
        style={{ color: badge.color, background: badge.bg }}>{badge.label}</span>
      {isRework && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest flex-shrink-0"
          style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
          Cycle {unit.reworkRecord?.cycleCount ?? 1}
        </span>
      )}
      <div className="flex items-center gap-1 text-[10px] text-zinc-600 ml-auto flex-shrink-0">
        <Clock className="w-2.5 h-2.5" />{elapsed(unit.updatedAt)}
        <ChevronRight className="w-3 h-3 ml-1" style={{ color: accentColor, opacity: 0.6 }} />
      </div>
    </button>
  );
}

// ─── Unit Card (active) ───────────────────────────────────────────────────────

function UnitCard({ unit, onSelect }: { unit: QCUnit; onSelect: (u: QCUnit) => void }) {
  const isRework = unit.currentStatus === 'REJECTED_BACK';
  const isActive = unit.currentStatus === 'IN_PROGRESS';
  const accentColor  = isRework ? '#f87171' : isActive ? '#38bdf8' : '#94a3b8';
  const accentBg     = isRework ? 'rgba(248,113,113,0.06)' : isActive ? 'rgba(56,189,248,0.06)' : 'rgba(148,163,184,0.04)';
  const accentBorder = isRework ? 'rgba(248,113,113,0.2)'  : isActive ? 'rgba(56,189,248,0.18)'  : 'rgba(148,163,184,0.10)';
  const badge = STATUS_BADGE[unit.currentStatus] ?? STATUS_BADGE.PENDING;

  return (
    <button type="button" onClick={() => onSelect(unit)}
      className="w-full text-left rounded-xl p-3 relative overflow-hidden transition-opacity hover:opacity-90 active:opacity-75"
      style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
      {isRework && (
        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest pointer-events-none"
          style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171' }}>
          Rework
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: accentColor }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-mono text-sm font-semibold text-white leading-tight">{unit.serialNumber}</p>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ color: badge.color, background: badge.bg }}>{badge.label}</span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            {unit.order?.product.name ?? '—'} · <span className="text-zinc-500">{unit.order?.orderNumber ?? '—'}</span>
          </p>
          <div className="flex items-center gap-3 mt-1.5">
            {unit.assignedTo && <p className="text-[10px] text-zinc-500">{unit.assignedTo.name}</p>}
            <div className="flex items-center gap-1 text-[10px] text-zinc-600">
              <Clock className="w-2.5 h-2.5" />{elapsed(unit.updatedAt)}
            </div>
            <div className="ml-auto flex items-center gap-0.5 text-[10px]" style={{ color: accentColor, opacity: 0.7 }}>
              {isRework ? 'Re-run' : 'Open'} <ChevronRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Completed Card — expandable with full test results + print PDF ──────────

function CompletedCard({ unit }: { unit: CompletedUnit }) {
  const [expanded, setExpanded] = useState(false);
  const isFail = unit.qcResult === 'FAIL';

  const accentColor  = isFail ? '#f87171'              : '#4ade80';
  const accentBg     = isFail ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)';
  const accentBorder = isFail ? 'rgba(239,68,68,0.2)'  : 'rgba(34,197,94,0.18)';
  const dividerColor = isFail ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)';

  // Count pass/fail from new or old checklist data format
  const checklistEntries = unit.checklistData ? Object.entries(unit.checklistData) : [];
  let passCount = 0;
  let failCountItems = 0;
  for (const [, val] of checklistEntries) {
    const v = val as Record<string, unknown>;
    const status = v?.status as string;
    if (status === 'PASS') passCount++;
    else if (status === 'FAIL') failCountItems++;
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>

      {/* Summary row */}
      <button type="button" onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4 hover:bg-white/[0.02] transition-colors">
        <div className="flex items-start gap-3">
          <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: accentColor }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-mono text-sm font-semibold text-white leading-tight">{unit.serialNumber}</p>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ color: accentColor, background: isFail ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)' }}>
                {isFail ? 'QC Fail' : 'QC Pass'}
              </span>
              {unit.hadRework && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest"
                  style={{ color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  Rework
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {unit.order?.product.name ?? '—'} · <span className="text-zinc-500">{unit.order?.orderNumber ?? '—'}</span>
            </p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {unit.qcPassedBy && <p className="text-[10px] text-zinc-500">By {unit.qcPassedBy.name}</p>}
              {unit.firmwareVersion && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{ color: '#94a3b8', background: 'rgba(148,163,184,0.08)' }}>
                  FW {unit.firmwareVersion}
                </span>
              )}
              {checklistEntries.length > 0 && (
                <span className="text-[10px] text-zinc-500">
                  {passCount} pass · <span style={{ color: failCountItems > 0 ? '#f87171' : '#71717a' }}>{failCountItems} fail</span>
                </span>
              )}
              <div className="ml-auto flex items-center gap-1.5 text-[10px] text-zinc-600">
                <Clock className="w-2.5 h-2.5" />{elapsed(unit.updatedAt)}
                <ChevronDown className={`w-3.5 h-3.5 ml-0.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </div>
        </div>
      </button>

      {/* Expanded: full test results + print */}
      {expanded && (
        <div className="border-t" style={{ borderColor: dividerColor }}>
          <div className="px-4 pt-3 pb-2">
            <a href={`/print/qc/${unit.id}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}>
              <Printer className="w-3.5 h-3.5" /> Print PDF Report
            </a>
          </div>

          {checklistEntries.length > 0 ? (
            <div className="mx-4 mb-4 rounded-xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="grid grid-cols-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500"
                style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span>Test Item</span>
                <span className="text-center">Result</span>
                <span className="text-right">Details</span>
              </div>
              {checklistEntries.map(([key, val], idx) => {
                const v = val as Record<string, unknown>;
                const name = (v?.name as string) || key;
                const status = (v?.status as string) || '—';
                const isPass = status === 'PASS';
                const isFItem = status === 'FAIL';
                const paramValues = (v?.paramValues as Record<string, unknown>) ?? {};
                const paramCount = Object.keys(paramValues).filter(k => paramValues[k] != null && paramValues[k] !== '').length;

                return (
                  <div key={key}
                    className={`grid grid-cols-3 items-center px-3 py-2 text-xs ${idx > 0 ? 'border-t' : ''}`}
                    style={idx > 0 ? { borderColor: 'rgba(255,255,255,0.04)' } : undefined}>
                    <span className="text-zinc-300 font-medium flex items-center gap-1">
                      {name}
                      {!!v?.photoUrl && <Camera className="w-3 h-3 text-sky-400" />}
                    </span>
                    <span className="text-center">
                      {isPass ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ color: '#4ade80', background: 'rgba(34,197,94,0.12)' }}>
                          <Check className="w-2.5 h-2.5" /> PASS
                        </span>
                      ) : isFItem ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ color: '#f87171', background: 'rgba(239,68,68,0.12)' }}>
                          <X className="w-2.5 h-2.5" /> FAIL
                        </span>
                      ) : (
                        <span className="text-zinc-600 text-[10px]">—</span>
                      )}
                    </span>
                    <span className="text-right text-zinc-500 text-[10px]">
                      {paramCount > 0 ? `${paramCount} values` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-zinc-600 text-xs italic px-4 pb-4">No checklist data recorded for this test</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-zinc-700 max-w-md mx-auto"
      style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
        style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)' }}>
        <Check className="w-5 h-5 text-emerald-400" />
      </div>
      <p className="text-zinc-400 text-sm font-medium">{message}</p>
      <p className="text-zinc-600 text-xs mt-1">{sub}</p>
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

export function QCWorkPanel({ role }: { role: string }) {
  const [activeUnits,    setActiveUnits]    = useState<QCUnit[]>([]);
  const [completedUnits, setCompletedUnits] = useState<CompletedUnit[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<QCUnit | null>(null);
  const [tab, setTab]             = useState<'pending' | 'processing' | 'completed'>('pending');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/qc/units');
      if (res.ok) {
        const data = await res.json() as { active: QCUnit[]; completed: CompletedUnit[] };
        setActiveUnits(data.active ?? []);
        setCompletedUnits(data.completed ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pending    = activeUnits.filter((u) => u.currentStatus === 'PENDING' || u.currentStatus === 'REJECTED_BACK');
  const processing = activeUnits.filter((u) => u.currentStatus === 'IN_PROGRESS');

  // Unit detail view
  if (selected) {
    return (
      <div className="w-full px-4 pb-24 max-w-2xl mx-auto">
        <div className="pt-6 pb-4 flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="text-sm text-zinc-400 hover:text-white transition-colors">
            ← Back
          </button>
          <div className="flex-1">
            <h1 className="text-white font-semibold text-base font-mono">{selected.serialNumber}</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              {selected.order?.product.name ?? 'Unknown'} · {selected.order?.orderNumber ?? '—'}
            </p>
          </div>
        </div>
        <InlineQCChecklist unit={selected} onDone={() => { setSelected(null); load(); }} />
      </div>
    );
  }

  const tabUnits      = tab === 'pending' ? pending : processing;
  const showCompleted = tab === 'completed';

  const tabs = [
    { key: 'pending'    as const, label: 'Pending',    count: pending.length        },
    { key: 'processing' as const, label: 'Processing', count: processing.length     },
    { key: 'completed'  as const, label: 'Completed',  count: completedUnits.length },
  ];

  return (
    <div className="w-full px-4 pb-24">
      {/* Header */}
      <div className="pt-6 pb-3 flex items-center justify-between max-w-4xl mx-auto">
        <div>
          <h1 className="text-white text-xl font-bold">QC Work</h1>
          <p className="text-zinc-500 text-sm mt-0.5">QC &amp; Software testing queue</p>
        </div>
        <button onClick={load}
          className="text-xs px-3 py-1.5 rounded-lg text-zinc-400 hover:text-white transition-colors"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-5 max-w-4xl mx-auto"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === t.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}>
            {t.label}
            {t.count > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                style={{
                  background: tab === t.key ? 'rgba(14,165,233,0.2)' : 'rgba(255,255,255,0.06)',
                  color:      tab === t.key ? '#38bdf8'               : '#52525b',
                }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : showCompleted ? (
        completedUnits.length === 0 ? (
          <EmptyState message="No completed QC this month" sub="Passed units will appear here" />
        ) : (
          <div className="flex flex-col gap-2 max-w-4xl mx-auto">
            {completedUnits.map((u) => (
              <CompletedCard key={u.id} unit={u} />
            ))}
          </div>
        )
      ) : tabUnits.length === 0 ? (
        <EmptyState
          message={tab === 'pending' ? 'No units pending QC' : 'Nothing in progress'}
          sub={tab === 'pending' ? 'All units have been picked up' : 'No active QC tests running'}
        />
      ) : (
        <div className="flex flex-col gap-2 max-w-4xl mx-auto">
          {groupByOrder(tabUnits).map((g) => (
            <OrderGroupAccordion key={g.orderId} group={g} onSelect={setSelected} />
          ))}
        </div>
      )}
    </div>
  );
}
