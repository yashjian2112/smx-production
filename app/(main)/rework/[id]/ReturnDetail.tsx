'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Clock, Wrench, Package, XCircle, ChevronRight, Pencil, Trash2, Printer, Camera, AlertTriangle } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type RepairLog = {
  id: string;
  issue: string;
  workDone: string | null;
  beforePhotoUrl: string | null;
  boardPhotoUrl: string | null;
  afterPhotoUrl: string | null;
  startedAt: string;
  completedAt: string | null;
  employee: { id: string; name: string };
};

type ReworkMaterial = {
  id: string;
  materialName: string;
  unit: string;
  qtyRequested: number;
  qtyIssued: number;
  currentStock: number;
  status: string;
  notes: string | null;
  requestedBy: { name: string };
  issuedBy: { name: string } | null;
  issuedAt: string | null;
  createdAt: string;
};

type MaterialOption = {
  id: string;
  code: string;
  name: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
};

type BomItem = {
  rawMaterialId: string;
  materialName: string;
  code: string;
  unit: string;
  quantityRequired: number;
  currentStock: number;
  minimumStock: number;
};

type ReturnData = {
  id: string;
  returnNumber: string;
  status: string;
  type: string;
  reportedIssue: string;
  serialNumber: string | null;
  evaluationNotes: string | null;
  resolution: string | null;
  faultType: string | null;
  faultApproval: string | null;
  faultApprovedBy: { id: string; name: string } | null;
  blameEmployee: { id: string; name: string } | null;
  blameStage: string | null;
  blameDate: string | null;
  topPhotoUrl: string | null;
  bbInspectionPhotoUrl: string | null;
  psInspectionPhotoUrl: string | null;
  createdAt: string;
  updatedAt: string;
  client: { code: string; customerName: string; globalOrIndian?: string | null };
  unit: {
    id: string;
    serialNumber: string;
    currentStage: string;
    currentStatus: string;
    product: { name: string; code: string };
  } | null;
  order: { id: string; orderNumber: string } | null;
  reportedBy: { id: string; name: string };
  evaluatedBy: { id: string; name: string } | null;
  repairLogs: RepairLog[];
};

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_STEPS = [
  { key: 'REPORTED',      label: 'Reported' },
  { key: 'EVALUATED',     label: 'Evaluated' },
  { key: 'APPROVED',      label: 'Approved' },
  { key: 'UNIT_RECEIVED', label: 'Unit Received' },
  { key: 'IN_REPAIR',     label: 'In Repair' },
  { key: 'REPAIRED',      label: 'Repaired' },
  { key: 'QC_CHECKED',    label: 'QC Checked' },
  { key: 'DISPATCHED',    label: 'Dispatched' },
  { key: 'CLOSED',        label: 'Closed' },
];

const TERMINAL = ['CLOSED', 'REJECTED'];

const STATUS_STYLES: Record<string, { bg: string; color: string; text: string }> = {
  REPORTED:      { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', text: 'Reported' },
  EVALUATED:     { bg: 'rgba(56,189,248,0.12)',  color: '#38bdf8', text: 'Evaluated' },
  APPROVED:      { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', text: 'Approved' },
  UNIT_RECEIVED: { bg: 'rgba(168,85,247,0.12)',  color: '#a855f7', text: 'Unit Received' },
  IN_REPAIR:     { bg: 'rgba(249,115,22,0.12)',  color: '#f97316', text: 'In Repair' },
  REPAIRED:      { bg: 'rgba(34,197,94,0.12)',   color: '#22c55e', text: 'Repaired' },
  QC_CHECKED:    { bg: 'rgba(56,189,248,0.12)',  color: '#38bdf8', text: 'QC Checked' },
  DISPATCHED:    { bg: 'rgba(99,102,241,0.12)',  color: '#6366f1', text: 'Dispatched' },
  CLOSED:        { bg: 'rgba(113,113,122,0.15)', color: '#a1a1aa', text: 'Closed' },
  REJECTED:      { bg: 'rgba(239,68,68,0.12)',   color: '#ef4444', text: 'Rejected' },
};

const RESOLUTION_LABELS: Record<string, string> = {
  REPAIR:      'Repair',
  REPLACE:     'Replace',
  REFUND:      'Refund',
  CREDIT_NOTE: 'Credit Note',
};

const FAULT_STAGES = [
  { value: 'POWERSTAGE', label: 'Powerstage' },
  { value: 'BRAINBOARD', label: 'Brainboard' },
  { value: 'ASSEMBLY',   label: 'Controller Assembly' },
  { value: 'QC',         label: 'QC / Software' },
  { value: 'FINAL',      label: 'Final Assembly' },
  { value: 'DEAD',       label: 'Dead Controller' },
];

// Map wizard fault stage values to Prisma StageType enum
const STAGE_TO_ENUM: Record<string, string> = {
  POWERSTAGE: 'POWERSTAGE_MANUFACTURING',
  BRAINBOARD: 'BRAINBOARD_MANUFACTURING',
  ASSEMBLY:   'CONTROLLER_ASSEMBLY',
  QC:         'QC_AND_SOFTWARE',
  FINAL:      'FINAL_ASSEMBLY',
};

function buildIssueText(stage: string, description: string, deadReason: string): string {
  if (stage === 'DEAD') return `[Dead Controller] ${deadReason.trim()}`;
  const stageName = FAULT_STAGES.find(s => s.value === stage)?.label ?? stage;
  return `[${stageName}] ${description.trim()}`;
}

function parseIssue(issue: string): { tag: string | null; body: string } {
  const m = issue.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
  if (m) return { tag: m[1], body: m[2] };
  return { tag: null, body: issue };
}

function getNextActions(status: string, role: string): { label: string; value: string; color: string }[] {
  const isAdminOrManager = ['ADMIN', 'PRODUCTION_MANAGER'].includes(role);
  const isEmployee = role === 'PRODUCTION_EMPLOYEE';
  const isSales = role === 'SALES';
  switch (status) {
    case 'REPORTED':
      if (isAdminOrManager || isSales) return [
        { label: 'Mark Evaluated', value: 'EVALUATED', color: '#38bdf8' },
        { label: 'Reject',        value: 'REJECTED',  color: '#ef4444' },
      ];
      break;
    case 'EVALUATED':
      if (isAdminOrManager) return [
        { label: 'Approve', value: 'APPROVED',  color: '#22c55e' },
        { label: 'Reject',  value: 'REJECTED',  color: '#ef4444' },
      ];
      break;
    case 'APPROVED':
      if (isAdminOrManager || isEmployee) return [
        { label: 'Mark Unit Received',  value: 'UNIT_RECEIVED', color: '#a855f7' },
        { label: 'Start Repair Directly', value: 'IN_REPAIR',   color: '#f97316' },
      ];
      break;
    case 'UNIT_RECEIVED':
      if (isAdminOrManager || isEmployee) return [
        { label: 'Start Repair', value: 'IN_REPAIR', color: '#f97316' },
      ];
      break;
    case 'REPAIRED':
      if (isAdminOrManager || isEmployee) return [
        { label: 'Submit for QC', value: 'QC_CHECKED', color: '#38bdf8' },
        { label: 'Back to Repair', value: 'IN_REPAIR', color: '#f97316' },
      ];
      break;
    case 'QC_CHECKED':
      if (isAdminOrManager || role === 'QC_USER') return [
        { label: 'QC Pass — Dispatch', value: 'DISPATCHED', color: '#6366f1' },
        { label: 'QC Fail — Send Back to Repair', value: 'IN_REPAIR', color: '#ef4444' },
      ];
      break;
    case 'DISPATCHED':
      if (isAdminOrManager) return [
        { label: 'Close', value: 'CLOSED', color: '#a1a1aa' },
      ];
      break;
  }
  return [];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBar({ status }: { status: string }) {
  if (status === 'REJECTED') {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
        <XCircle className="w-4 h-4 text-red-400" />
        <span className="text-sm font-medium text-red-400">Return Rejected</span>
      </div>
    );
  }
  const currentIndex = STATUS_STEPS.findIndex(s => s.key === status);
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-center gap-0 min-w-max">
        {STATUS_STEPS.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border"
                  style={
                    done   ? { background: '#22c55e', borderColor: '#22c55e', color: '#fff' } :
                    active ? { background: '#0ea5e9', borderColor: '#0ea5e9', color: '#fff' } :
                             { background: 'transparent', borderColor: '#3f3f46', color: '#71717a' }
                  }
                >
                  {done ? '✓' : i + 1}
                </div>
                <span className="text-[9px] font-medium" style={{ color: active ? '#0ea5e9' : done ? '#22c55e' : '#52525b' }}>
                  {step.label}
                </span>
              </div>
              {i < STATUS_STEPS.length - 1 && (
                <div className="w-6 h-px mb-4 mx-0.5" style={{ background: done ? '#22c55e' : '#27272a' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RepairLogCard({ log }: { log: RepairLog }) {
  const started = new Date(log.startedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const completed = log.completedAt
    ? new Date(log.completedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;
  const { tag, body } = parseIssue(log.issue);
  const isDead = tag === 'Dead Controller';
  const photos = [
    log.beforePhotoUrl ? { url: log.beforePhotoUrl, label: 'Outer' } : null,
    log.boardPhotoUrl  ? { url: log.boardPhotoUrl,  label: 'Board' } : null,
    log.afterPhotoUrl  ? { url: log.afterPhotoUrl,  label: 'After' } : null,
  ].filter(Boolean) as { url: string; label: string }[];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-white">{log.employee.name}</span>
        <span className="text-[10px] text-zinc-500">{started}</span>
      </div>
      <div className="p-2 rounded-md" style={{
        background: isDead ? 'rgba(239,68,68,0.06)' : 'rgba(251,191,36,0.06)',
        border:     isDead ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(251,191,36,0.12)',
      }}>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: isDead ? '#f87171' : '#f59e0b' }}>
            {isDead ? 'Dead Controller' : 'Diagnosis / Issue Found'}
          </p>
          {tag && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{
              background: isDead ? 'rgba(239,68,68,0.15)' : 'rgba(251,191,36,0.15)',
              color:      isDead ? '#fca5a5' : '#fde68a',
            }}>
              {tag}
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: isDead ? '#fca5a5' : '#fde68a' }}>{body}</p>
      </div>

      {/* Photos row */}
      {photos.length > 0 && (
        <div className="flex gap-2">
          {photos.map(p => (
            <a key={p.label} href={p.url} target="_blank" rel="noreferrer" className="flex-1">
              <div className="rounded-md overflow-hidden border border-zinc-700" style={{ aspectRatio: '4/3', background: '#18181b' }}>
                <img src={p.url} alt={p.label} className="w-full h-full object-cover" />
              </div>
              <p className="text-[9px] text-zinc-500 text-center mt-0.5">{p.label}</p>
            </a>
          ))}
        </div>
      )}

      {log.workDone ? (
        <div className="p-2 rounded-md" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)' }}>
          <p className="text-[9px] font-semibold text-emerald-500 uppercase tracking-wider mb-0.5">Work Done</p>
          <p className="text-xs text-emerald-200">{log.workDone}</p>
          {completed && <p className="text-[10px] text-zinc-500 mt-1">Completed {completed}</p>}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] text-amber-400">Repair in progress</span>
        </div>
      )}
    </div>
  );
}

// Photo capture input helper
function PhotoCapture({
  label,
  hint,
  photoUrl,
  uploading,
  onFile,
}: {
  label: string;
  hint: string;
  photoUrl: string;
  uploading: boolean;
  onFile: (f: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <label className="text-[10px] text-zinc-400 block">{label}</label>
      <p className="text-[10px] text-zinc-600">{hint}</p>
      {photoUrl ? (
        <div className="relative rounded-lg overflow-hidden border border-emerald-700/40" style={{ aspectRatio: '4/3', background: '#18181b', maxWidth: 240 }}>
          <img src={photoUrl} alt={label} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 opacity-0 hover:opacity-100 transition-opacity"
          >
            <Camera className="w-5 h-5 text-white" />
            <span className="text-[10px] text-white mt-1">Retake</span>
          </button>
          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
            <CheckCircle className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors disabled:opacity-50"
          style={{ borderColor: '#3f3f46', background: 'rgba(255,255,255,0.02)', width: 180, height: 120 }}
        >
          {uploading ? (
            <span className="text-[10px] text-zinc-400">Uploading…</span>
          ) : (
            <>
              <Camera className="w-6 h-6 text-zinc-500" />
              <span className="text-[10px] text-zinc-500">Tap to capture</span>
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ─── Repair Wizard ────────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { n: 1, label: 'Outer Photo' },
  { n: 2, label: 'Board Photos' },
  { n: 3, label: 'Faulty Stage' },
  { n: 4, label: 'Describe Issue' },
  { n: 5, label: 'Confirm Unit' },
];

function WizardStepBar({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0">
      {WIZARD_STEPS.map((s, i) => {
        const done   = s.n < step;
        const active = s.n === step;
        return (
          <div key={s.n} className="flex items-center">
            <div className="flex flex-col items-center gap-0.5">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                style={
                  done   ? { background: '#22c55e', color: '#fff' } :
                  active ? { background: '#f97316', color: '#fff' } :
                           { background: '#27272a', color: '#52525b' }
                }
              >
                {done ? '✓' : s.n}
              </div>
              <span className="text-[8px] font-medium whitespace-nowrap" style={{ color: active ? '#f97316' : done ? '#22c55e' : '#52525b' }}>
                {s.label}
              </span>
            </div>
            {i < WIZARD_STEPS.length - 1 && (
              <div className="w-5 h-px mb-3 mx-0.5" style={{ background: done ? '#22c55e' : '#27272a' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Fault Approval (Sales/Admin) ────────────────────────────────────────

function FaultApprovalCard({ returnId, onDone }: { returnId: string; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');

  async function handleApproval(action: 'APPROVED' | 'REJECTED') {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/returns/${returnId}/fault-approval`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason || undefined }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? 'Failed');
      } else {
        onDone();
      }
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="card p-4 space-y-3" style={{ border: '1px solid rgba(251,191,36,0.3)' }}>
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <p className="text-sm font-medium text-amber-400">Customer Damage — Approval Required</p>
      </div>
      <p className="text-xs text-zinc-400">
        Production has determined this is customer damage. Approve to allow repair work to proceed.
      </p>
      <textarea
        className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
        style={{ background: '#18181b', border: '1px solid #27272a', minHeight: 60 }}
        placeholder="Add notes (optional)..."
        value={reason} onChange={e => setReason(e.target.value)}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => handleApproval('APPROVED')}
          disabled={loading}
          className="flex-1 py-2 rounded-lg text-xs font-medium text-white transition-opacity disabled:opacity-40"
          style={{ background: '#22c55e' }}
        >{loading ? 'Processing...' : 'Approve'}</button>
        <button
          onClick={() => handleApproval('REJECTED')}
          disabled={loading}
          className="flex-1 py-2 rounded-lg text-xs font-medium text-white transition-opacity disabled:opacity-40"
          style={{ background: '#ef4444' }}
        >{loading ? 'Processing...' : 'Reject'}</button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ReturnDetail({
  data,
  role,
  userId,
}: {
  data: ReturnData;
  role: string;
  userId: string;
}) {
  const router = useRouter();
  const st = STATUS_STYLES[data.status] ?? STATUS_STYLES.REPORTED;

  const isAdminOrManager = ['ADMIN', 'PRODUCTION_MANAGER'].includes(role);
  const isEmployee = role === 'PRODUCTION_EMPLOYEE';
  const isSales = role === 'SALES';

  const LOCKED_STATUSES = ['IN_REPAIR', 'REPAIRED', 'QC_CHECKED', 'DISPATCHED', 'CLOSED'];
  const isAdmin = role === 'ADMIN';
  const canEditDelete = isAdmin || (['SALES'].includes(role) && !LOCKED_STATUSES.includes(data.status));

  const openLog = data.repairLogs.find(l => !l.completedAt);
  const nextActions = getNextActions(data.status, role);

  // Evaluation
  const [evalNotes,    setEvalNotes]    = useState(data.evaluationNotes ?? '');
  const [resolution,   setResolution]   = useState(data.resolution ?? '');
  const [evalLoading,  setEvalLoading]  = useState(false);
  const [evalError,    setEvalError]    = useState('');

  // Status transition
  const [actionLoading, setActionLoading] = useState('');
  const [actionError,   setActionError]   = useState('');

  // Create Dispatch Order
  const [creatingDO,   setCreatingDO]   = useState(false);
  const [doError,      setDoError]      = useState('');

  async function createDispatchOrder() {
    setCreatingDO(true);
    setDoError('');
    try {
      const res = await fetch('/api/dispatch-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnRequestId: data.id, dispatchQty: 1 }),
      });
      const json = await res.json() as { id?: string; error?: string };
      if (!res.ok) { setDoError(json.error ?? 'Failed to create dispatch order'); return; }
      router.push(`/shipping/do/${json.id}`);
    } catch {
      setDoError('Network error');
    } finally {
      setCreatingDO(false);
    }
  }

  // Edit form
  const [showEdit,    setShowEdit]    = useState(false);
  const [editSerial,  setEditSerial]  = useState(data.serialNumber ?? '');
  const [editIssue,   setEditIssue]   = useState(data.reportedIssue);
  const [editLoading, setEditLoading] = useState(false);
  const [editError,   setEditError]   = useState('');

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError,   setDeleteError]   = useState('');

  // Complete repair form
  const [workDone,         setWorkDone]         = useState('');
  const [afterPhotoUrl,    setAfterPhotoUrl]     = useState('');
  const [afterUploading,   setAfterUploading]    = useState(false);
  const [completeLoading,  setCompleteLoading]   = useState(false);
  const [completeError,    setCompleteError]     = useState('');
  const afterInputRef = useRef<HTMLInputElement>(null);

  // ── Repair Wizard state ──
  const CAN_START_REPAIR = ['REPORTED', 'APPROVED', 'UNIT_RECEIVED', 'IN_REPAIR', 'EVALUATED'].includes(data.status);
  const customerDamagePending = data.faultType === 'CUSTOMER_DAMAGE' && data.faultApproval !== 'APPROVED';
  const showWizard = (isEmployee || isAdminOrManager) && !TERMINAL.includes(data.status) && CAN_START_REPAIR && !openLog && !customerDamagePending;

  const [wizardStep,       setWizardStep]       = useState(1);
  const [outerPhotoUrl,    setOuterPhotoUrl]     = useState('');
  const [outerUploading,   setOuterUploading]    = useState(false);
  const [boardPhotoUrl,    setBoardPhotoUrl]     = useState('');
  const [boardUploading,   setBoardUploading]    = useState(false);
  const [psPhotoUrl,       setPsPhotoUrl]        = useState('');
  const [psUploading,      setPsUploading]       = useState(false);
  const [faultTypeChoice,  setFaultTypeChoice]   = useState<'MANUFACTURING_DEFECT' | 'CUSTOMER_DAMAGE' | ''>('');
  const [faultStage,       setFaultStage]        = useState('');
  const [issueText,        setIssueText]         = useState('');
  const [deadReason,       setDeadReason]        = useState('');
  const [barcodeConfirm,   setBarcodeConfirm]    = useState('');
  const [repairError,      setRepairError]       = useState('');
  const [repairLoading,    setRepairLoading]     = useState(false);

  // BOM items loaded when fault stage changes
  const [bomItems,    setBomItems]    = useState<BomItem[]>([]);
  const [bomLoading,  setBomLoading]  = useState(false);

  useEffect(() => {
    if (!faultStage || faultStage === 'DEAD' || !data.unit) {
      setBomItems([]);
      return;
    }
    setBomLoading(true);
    fetch(`/api/returns/${data.id}/bom-materials?stage=${faultStage}`)
      .then(r => r.json())
      .then(d => setBomItems(Array.isArray(d) ? d : []))
      .catch(() => setBomItems([]))
      .finally(() => setBomLoading(false));
  }, [faultStage, data.id, data.unit]);

  // Expected serial for barcode confirmation
  const expectedSerial = (data.unit?.serialNumber ?? data.serialNumber ?? '').toUpperCase();
  const barcodeOk = !expectedSerial || barcodeConfirm.trim().toUpperCase() === expectedSerial;

  // ── Materials ──
  const [materials,         setMaterials]         = useState<ReworkMaterial[]>([]);
  const [matsLoading,       setMatsLoading]       = useState(true);
  const [showMatForm,       setShowMatForm]       = useState(false);
  const [matSearch,         setMatSearch]         = useState('');
  const [matOptions,        setMatOptions]        = useState<MaterialOption[]>([]);
  const [matSearchLoading,  setMatSearchLoading]  = useState(false);
  const [selectedMat,       setSelectedMat]       = useState<MaterialOption | null>(null);
  const [matQty,            setMatQty]            = useState('');
  const [matNotes,          setMatNotes]          = useState('');
  const [matSaving,         setMatSaving]         = useState(false);
  const [matError,          setMatError]          = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // BOM items for materials form (loaded from current fault stage if known)
  const activeFaultStage = data.repairLogs[0]
    ? (() => {
        const m = data.repairLogs[0].issue.match(/^\[([^\]]+)\]/);
        if (!m) return '';
        const tag = m[1];
        return FAULT_STAGES.find(s => s.label === tag)?.value ?? '';
      })()
    : faultStage;

  const [matBomItems,   setMatBomItems]   = useState<BomItem[]>([]);
  const [matBomLoading, setMatBomLoading] = useState(false);
  const [useBom,        setUseBom]        = useState(false);

  useEffect(() => {
    if (!activeFaultStage || activeFaultStage === 'DEAD' || !data.unit) {
      setMatBomItems([]);
      setUseBom(false);
      return;
    }
    setMatBomLoading(true);
    fetch(`/api/returns/${data.id}/bom-materials?stage=${activeFaultStage}`)
      .then(r => r.json())
      .then(d => {
        const arr = Array.isArray(d) ? d : [];
        setMatBomItems(arr);
        setUseBom(arr.length > 0);
      })
      .catch(() => { setMatBomItems([]); setUseBom(false); })
      .finally(() => setMatBomLoading(false));
  }, [activeFaultStage, data.id, data.unit]);

  useEffect(() => {
    fetch(`/api/returns/${data.id}/materials`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setMaterials(Array.isArray(d) ? d : []))
      .finally(() => setMatsLoading(false));
  }, [data.id]);

  // ── Photo upload helper ──
  async function uploadPhoto(file: File, field: 'outer' | 'board' | 'after' | 'top' | 'bb' | 'ps'): Promise<string> {
    const fd = new FormData();
    fd.append(field, file);
    const res = await fetch(`/api/returns/${data.id}/repair/photos`, { method: 'POST', body: fd });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(j.error ?? 'Photo upload failed');
    }
    const j = await res.json() as Record<string, string>;
    const keyMap: Record<string, string> = { outer: 'outerUrl', board: 'boardUrl', after: 'afterUrl', top: 'topUrl', bb: 'bbUrl', ps: 'psUrl' };
    return j[keyMap[field]] ?? '';
  }

  // ── Handlers ──

  async function saveEvaluation() {
    if (!evalNotes.trim() && !resolution) return;
    setEvalLoading(true); setEvalError('');
    try {
      const res = await fetch(`/api/returns/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluationNotes: evalNotes || undefined, resolution: resolution || undefined }),
      });
      if (!res.ok) { const j = await res.json(); setEvalError(j.error ?? 'Failed'); }
      else router.refresh();
    } catch { setEvalError('Network error'); }
    finally { setEvalLoading(false); }
  }

  async function advanceStatus(status: string) {
    setActionLoading(status); setActionError('');
    try {
      const res = await fetch(`/api/returns/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { const j = await res.json(); setActionError(j.error ?? 'Failed'); }
      else router.refresh();
    } catch { setActionError('Network error'); }
    finally { setActionLoading(''); }
  }

  async function startRepair() {
    if (!faultStage) { setRepairError('Please select the faulty stage.'); return; }
    if (faultStage === 'DEAD' && !deadReason.trim()) { setRepairError('Please describe the reason.'); return; }
    if (faultStage !== 'DEAD' && !issueText.trim()) { setRepairError('Please describe what you found.'); return; }
    if (expectedSerial && !barcodeOk) { setRepairError('Barcode does not match. Please scan the correct unit.'); return; }

    const issue = buildIssueText(faultStage, issueText, deadReason);
    setRepairLoading(true); setRepairError('');
    try {
      // Step 1: Submit fault determination if not already done
      if (!data.faultType && faultStage !== 'DEAD') {
        const inspectRes = await fetch(`/api/returns/${data.id}/inspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            faultType: faultTypeChoice,
            blameStage: STAGE_TO_ENUM[faultStage] || undefined,
            topPhotoUrl:          outerPhotoUrl || undefined,
            bbInspectionPhotoUrl: boardPhotoUrl || undefined,
            psInspectionPhotoUrl: psPhotoUrl    || undefined,
          }),
        });
        if (!inspectRes.ok) {
          const j = await inspectRes.json();
          setRepairError(j.error ?? 'Failed to save fault determination');
          setRepairLoading(false);
          return;
        }
        const inspectResult = await inspectRes.json() as { faultApproval?: string };
        // If customer damage → needs approval, don't proceed to repair
        if (faultTypeChoice === 'CUSTOMER_DAMAGE' && inspectResult.faultApproval === 'PENDING') {
          setRepairLoading(false);
          router.refresh();
          return;
        }
      }

      // Step 2: Create repair log
      const res = await fetch(`/api/returns/${data.id}/repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue,
          beforePhotoUrl: outerPhotoUrl || undefined,
          boardPhotoUrl:  boardPhotoUrl  || undefined,
        }),
      });
      if (!res.ok) { const j = await res.json(); setRepairError(j.error ?? 'Failed'); }
      else {
        setWizardStep(1); setFaultStage(''); setIssueText(''); setDeadReason('');
        setOuterPhotoUrl(''); setBoardPhotoUrl(''); setPsPhotoUrl('');
        setBarcodeConfirm(''); setFaultTypeChoice('');
        router.refresh();
      }
    } catch { setRepairError('Network error'); }
    finally { setRepairLoading(false); }
  }

  async function completeRepair() {
    if (!openLog || !workDone.trim()) return;
    setCompleteLoading(true); setCompleteError('');
    try {
      const res = await fetch(`/api/returns/${data.id}/repair`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repairLogId: openLog.id, workDone, afterPhotoUrl: afterPhotoUrl || undefined }),
      });
      if (!res.ok) { const j = await res.json(); setCompleteError(j.error ?? 'Failed'); }
      else { setWorkDone(''); setAfterPhotoUrl(''); router.refresh(); }
    } catch { setCompleteError('Network error'); }
    finally { setCompleteLoading(false); }
  }

  async function saveEdit() {
    setEditLoading(true); setEditError('');
    try {
      const res = await fetch(`/api/returns/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNumber: editSerial.trim(), reportedIssue: editIssue.trim() }),
      });
      if (!res.ok) { const j = await res.json(); setEditError(j.error ?? 'Failed'); }
      else { setShowEdit(false); router.refresh(); }
    } catch { setEditError('Network error'); }
    finally { setEditLoading(false); }
  }

  async function deleteReturn() {
    setDeleteLoading(true); setDeleteError('');
    try {
      const res = await fetch(`/api/returns/${data.id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); setDeleteError(j.error ?? 'Failed'); setDeleteLoading(false); }
      else router.push('/rework');
    } catch { setDeleteError('Network error'); setDeleteLoading(false); }
  }

  function onMatSearchChange(val: string) {
    setMatSearch(val);
    setSelectedMat(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!val.trim()) { setMatOptions([]); return; }
    setMatSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/inventory/materials/search?q=${encodeURIComponent(val)}`);
      if (res.ok) setMatOptions(await res.json());
      setMatSearchLoading(false);
    }, 400);
  }

  async function submitMaterialRequest() {
    if (!selectedMat) { setMatError('Select a material.'); return; }
    const qty = parseFloat(matQty);
    if (isNaN(qty) || qty <= 0) { setMatError('Enter a valid quantity.'); return; }
    const bomItem = matBomItems.find(b => b.rawMaterialId === selectedMat.id);
    if (bomItem && qty > bomItem.quantityRequired) {
      setMatError(`Max allowed by BOM: ${bomItem.quantityRequired} ${bomItem.unit}`);
      return;
    }
    setMatSaving(true); setMatError('');
    try {
      const res = await fetch(`/api/returns/${data.id}/materials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawMaterialId: selectedMat.id, qtyRequested: qty, notes: matNotes || undefined }),
      });
      if (!res.ok) { const j = await res.json(); setMatError(j.error ?? 'Failed'); }
      else {
        const created = await res.json();
        setMaterials(prev => [...prev, { ...created, currentStock: selectedMat.currentStock }]);
        setShowMatForm(false); setMatSearch(''); setSelectedMat(null); setMatQty(''); setMatNotes(''); setMatOptions([]);
      }
    } catch { setMatError('Network error'); }
    finally { setMatSaving(false); }
  }

  async function issueMaterial(mid: string) {
    const res = await fetch(`/api/returns/${data.id}/materials/${mid}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ISSUE' }),
    });
    if (res.ok) { const u = await res.json(); setMaterials(prev => prev.map(m => m.id === mid ? { ...m, ...u } : m)); }
    else { const j = await res.json(); alert(j.error ?? 'Failed'); }
  }

  async function deleteMaterial(mid: string) {
    const res = await fetch(`/api/returns/${data.id}/materials/${mid}`, { method: 'DELETE' });
    if (res.ok) setMaterials(prev => prev.filter(m => m.id !== mid));
  }

  // ── Render ──
  const date = new Date(data.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });

  return (
    <div className="space-y-4 pb-24 max-w-2xl mx-auto px-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-sky-400">{data.returnNumber}</span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.color }}>
              {st.text}
            </span>
            <span className="text-[10px] text-zinc-500">{date}</span>
          </div>
          <h1 className="text-lg font-bold text-white mt-1">{data.client.customerName}</h1>
          <p className="text-xs text-zinc-500 font-mono">{data.client.code}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <a
            href={`/print/rework/${data.id}`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #27272a', color: '#a1a1aa' }}
          >
            <Printer className="w-3 h-3" />
            Print
          </a>
          <button onClick={() => router.back()} className="text-xs text-zinc-500 hover:text-white transition-colors">
            ← Back
          </button>
        </div>
      </div>

      {/* Edit / Delete */}
      {canEditDelete && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowEdit(v => !v); setEditError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}
          >
            <Pencil className="w-3 h-3" />Edit
          </button>
          <button
            onClick={() => { setConfirmDelete(true); setDeleteError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
          >
            <Trash2 className="w-3 h-3" />Delete
          </button>
        </div>
      )}

      {showEdit && canEditDelete && (
        <div className="card p-4 space-y-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Edit Request</p>
          <div>
            <label className="text-[10px] text-zinc-400 mb-1 block">Serial Number</label>
            <input type="text" value={editSerial} onChange={e => setEditSerial(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
              style={{ background: '#18181b', border: '1px solid #27272a' }}
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 mb-1 block">Reported Issue</label>
            <textarea value={editIssue} onChange={e => setEditIssue(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
              style={{ background: '#18181b', border: '1px solid #27272a', minHeight: 72 }}
            />
          </div>
          {editError && <p className="text-xs text-red-400">{editError}</p>}
          <div className="flex gap-2">
            <button onClick={saveEdit} disabled={editLoading || !editSerial.trim() || !editIssue.trim()}
              className="flex-1 py-2 rounded-lg text-xs font-medium text-white transition-opacity disabled:opacity-40"
              style={{ background: '#0ea5e9' }}
            >{editLoading ? 'Saving…' : 'Save Changes'}</button>
            <button onClick={() => setShowEdit(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 transition-colors hover:text-white"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #27272a' }}
            >Cancel</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="card p-4 space-y-3" style={{ border: '1px solid rgba(239,68,68,0.3)' }}>
          <p className="text-sm font-medium text-red-400">Delete this replacement request?</p>
          <p className="text-xs text-zinc-500">This cannot be undone. All associated data will be removed.</p>
          {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
          <div className="flex gap-2">
            <button onClick={deleteReturn} disabled={deleteLoading}
              className="flex-1 py-2 rounded-lg text-xs font-medium text-white transition-opacity disabled:opacity-40"
              style={{ background: '#ef4444' }}
            >{deleteLoading ? 'Deleting…' : 'Yes, Delete'}</button>
            <button onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 transition-colors hover:text-white"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #27272a' }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="card p-4">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Progress</p>
        <StatusBar status={data.status} />
      </div>

      {/* Unit Info */}
      <div className="card p-4 space-y-2">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Unit Details</p>
        {data.unit ? (
          <>
            <div className="flex items-center gap-2">
              <Package className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-xs text-sky-300 font-mono">{data.unit.serialNumber}</span>
              <span className="text-[10px] text-zinc-500">— {data.unit.product.name}</span>
            </div>
            {data.order && (
              <p className="text-[10px] text-zinc-500">Order: <span className="text-zinc-300 font-mono">{data.order.orderNumber}</span></p>
            )}
          </>
        ) : data.serialNumber ? (
          <div className="flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-xs text-sky-300 font-mono">{data.serialNumber}</span>
            <span className="text-[10px] text-zinc-500">(not in system)</span>
          </div>
        ) : (
          <p className="text-xs text-zinc-500">No serial number provided</p>
        )}
        <p className="text-[10px] text-zinc-500">Reported by <span className="text-zinc-300">{data.reportedBy.name}</span></p>
      </div>

      {/* Reported Issue */}
      <div className="card p-4">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Reported Issue</p>
        <p className="text-sm text-amber-200">{data.reportedIssue}</p>
      </div>

      {/* Evaluation — admin/manager/sales */}
      {(isAdminOrManager || isSales) && (
        <div className="card p-4 space-y-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Evaluation</p>
          {data.evaluatedBy && (
            <p className="text-[10px] text-zinc-500">Evaluated by <span className="text-zinc-300">{data.evaluatedBy.name}</span></p>
          )}
          <div>
            <label className="text-[10px] text-zinc-400 mb-1 block">Resolution Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['REPAIR', 'REPLACE', 'REFUND', 'CREDIT_NOTE'] as const).map(r => (
                <button key={r} onClick={() => setResolution(resolution === r ? '' : r)}
                  className="px-3 py-2 rounded-lg text-xs font-medium border transition-colors"
                  style={resolution === r
                    ? { background: 'rgba(14,165,233,0.15)', border: '1px solid #0ea5e9', color: '#38bdf8' }
                    : { background: 'transparent', border: '1px solid #27272a', color: '#71717a' }}
                >{RESOLUTION_LABELS[r]}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 mb-1 block">Evaluation Notes</label>
            <textarea
              className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
              style={{ background: '#18181b', border: '1px solid #27272a', minHeight: 72 }}
              placeholder="Describe your findings..."
              value={evalNotes} onChange={e => setEvalNotes(e.target.value)}
            />
          </div>
          {evalError && <p className="text-xs text-red-400">{evalError}</p>}
          {!TERMINAL.includes(data.status) && (
            <button onClick={saveEvaluation} disabled={evalLoading || (!evalNotes.trim() && !resolution)}
              className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
              style={{ background: '#0ea5e9' }}
            >{evalLoading ? 'Saving…' : 'Save Evaluation'}</button>
          )}
        </div>
      )}

      {/* Read-only evaluation for employees */}
      {isEmployee && (data.evaluationNotes || data.resolution) && (
        <div className="card p-4 space-y-2">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Evaluation</p>
          {data.resolution && (
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8' }}>
              {RESOLUTION_LABELS[data.resolution]}
            </span>
          )}
          {data.evaluationNotes && <p className="text-xs text-zinc-300">{data.evaluationNotes}</p>}
          {data.evaluatedBy && <p className="text-[10px] text-zinc-500">By {data.evaluatedBy.name}</p>}
        </div>
      )}

      {/* Fault Type Determination — shown after inspection */}
      {data.faultType && (
        <div className="card p-4 space-y-2">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Fault Determination</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={data.faultType === 'MANUFACTURING_DEFECT'
                ? { background: 'rgba(239,68,68,0.12)', color: '#f87171' }
                : { background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
              {data.faultType === 'MANUFACTURING_DEFECT' ? 'Manufacturing Defect' : 'Customer Damage'}
            </span>
            {data.faultApproval && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={
                  data.faultApproval === 'APPROVED'
                    ? { background: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                    : data.faultApproval === 'REJECTED'
                    ? { background: 'rgba(239,68,68,0.12)', color: '#ef4444' }
                    : { background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }
                }>
                {data.faultApproval === 'APPROVED' ? 'Approved' : data.faultApproval === 'REJECTED' ? 'Rejected' : 'Awaiting Approval'}
              </span>
            )}
          </div>
          {data.faultApprovedBy && (
            <p className="text-[10px] text-zinc-500">
              {data.faultApproval === 'APPROVED' ? 'Approved' : 'Reviewed'} by {data.faultApprovedBy.name}
            </p>
          )}
          {/* Blame info — ADMIN only */}
          {isAdmin && data.blameEmployee && data.blameStage && (
            <div className="p-2 rounded-lg mt-2" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <p className="text-[9px] font-semibold text-red-500 uppercase tracking-wider mb-1">Accountability (Admin Only)</p>
              <p className="text-xs text-red-300">Employee: <span className="font-medium">{data.blameEmployee.name}</span></p>
              <p className="text-xs text-red-300">Stage: <span className="font-medium">{data.blameStage}</span></p>
              {data.blameDate && (
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Date: {new Date(data.blameDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fault Approval — for Sales/Admin when customer damage is pending */}
      {data.faultType === 'CUSTOMER_DAMAGE' && data.faultApproval === 'PENDING' && (isSales || isAdmin) && (
        <FaultApprovalCard returnId={data.id} onDone={() => router.refresh()} />
      )}

      {/* Pending approval notice for production users */}
      {data.faultType === 'CUSTOMER_DAMAGE' && data.faultApproval === 'PENDING' && (isEmployee || isAdminOrManager) && !isSales && !isAdmin && (
        <div className="card p-4 space-y-2" style={{ border: '1px solid rgba(251,191,36,0.2)' }}>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <p className="text-sm font-medium text-amber-400">Awaiting Approval</p>
          </div>
          <p className="text-xs text-zinc-400">
            This unit has been identified as customer damage. Repair cannot start until Sales or Admin approves.
          </p>
        </div>
      )}

      {/* Dispatch via DO flow — QC_CHECKED + admin/manager */}
      {data.status === 'QC_CHECKED' && isAdminOrManager && (
        <div className="card p-4 space-y-2">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Dispatch</p>
          {doError && <p className="text-xs text-red-400 mb-2">{doError}</p>}
          <button
            onClick={createDispatchOrder}
            disabled={creatingDO}
            className="px-4 py-2 rounded-lg text-xs font-medium transition-opacity disabled:opacity-40 flex items-center gap-1.5"
            style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#818cf8' }}
          >
            {creatingDO ? 'Creating…' : 'Create Dispatch Order'}
            {!creatingDO && <ChevronRight className="w-3 h-3" />}
          </button>
        </div>
      )}

      {/* Status Action Buttons */}
      {nextActions.length > 0 && !TERMINAL.includes(data.status) && (
        <div className="card p-4 space-y-2">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Advance Status</p>
          {actionError && <p className="text-xs text-red-400 mb-2">{actionError}</p>}
          <div className="flex flex-wrap gap-2">
            {nextActions.map(action => (
              <button key={action.value} onClick={() => advanceStatus(action.value)} disabled={!!actionLoading}
                className="px-4 py-2 rounded-lg text-xs font-medium text-white transition-opacity disabled:opacity-40 flex items-center gap-1.5"
                style={{ background: action.color + '22', border: `1px solid ${action.color}44`, color: action.color }}
              >
                {actionLoading === action.value ? 'Updating…' : action.label}
                {actionLoading !== action.value && <ChevronRight className="w-3 h-3" />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Repair Logs */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Repair Log</p>
          {data.repairLogs.length > 0 && (
            <span className="text-[10px] text-zinc-500">{data.repairLogs.length} entr{data.repairLogs.length === 1 ? 'y' : 'ies'}</span>
          )}
        </div>
        {data.repairLogs.length === 0 && (
          <div className="text-center py-4">
            <Wrench className="w-4 h-4 text-zinc-600 mx-auto mb-2" />
            <p className="text-xs text-zinc-500">No repair logs yet</p>
          </div>
        )}
        {data.repairLogs.map(log => <RepairLogCard key={log.id} log={log} />)}
      </div>

      {/* ── Repair Wizard (Employee + Admin/Manager) ── */}
      {showWizard && (
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Start Repair</p>
            <span className="text-[10px] text-zinc-600">Step {wizardStep} of 5</span>
          </div>

          <WizardStepBar step={wizardStep} />

          {/* Step 1: Outer Photo */}
          {wizardStep === 1 && (
            <div className="space-y-4">
              <PhotoCapture
                label="Outer Photo — Controller as received"
                hint="Place the controller on a flat surface. Capture the outer casing before opening."
                photoUrl={outerPhotoUrl}
                uploading={outerUploading}
                onFile={async (f) => {
                  setOuterUploading(true); setRepairError('');
                  try { const url = await uploadPhoto(f, 'outer'); setOuterPhotoUrl(url); }
                  catch (e) { setRepairError(e instanceof Error ? e.message : 'Photo upload failed. Try again.'); }
                  finally { setOuterUploading(false); }
                }}
              />
              {repairError && <p className="text-xs text-red-400">{repairError}</p>}
              <button
                disabled={!outerPhotoUrl || outerUploading}
                onClick={() => { setRepairError(''); setWizardStep(2); }}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
                style={{ background: '#f97316' }}
              >
                Next: Board Photos
              </button>
              <p className="text-[10px] text-zinc-600 text-center">
                Photo required before proceeding
              </p>
            </div>
          )}

          {/* Step 2: Board Photos */}
          {wizardStep === 2 && (
            <div className="space-y-4">
              <p className="text-[10px] text-zinc-500">Open the controller casing. Photograph both boards clearly.</p>
              <div className="grid grid-cols-2 gap-4">
                <PhotoCapture
                  label="Brainboard"
                  hint="Top board — control PCB"
                  photoUrl={boardPhotoUrl}
                  uploading={boardUploading}
                  onFile={async (f) => {
                    setBoardUploading(true); setRepairError('');
                    try { const url = await uploadPhoto(f, 'board'); setBoardPhotoUrl(url); }
                    catch (e) { setRepairError(e instanceof Error ? e.message : 'Photo upload failed. Try again.'); }
                    finally { setBoardUploading(false); }
                  }}
                />
                <PhotoCapture
                  label="Powerstage"
                  hint="Bottom board — MOSFET / driver PCB"
                  photoUrl={psPhotoUrl}
                  uploading={psUploading}
                  onFile={async (f) => {
                    setPsUploading(true); setRepairError('');
                    try { const url = await uploadPhoto(f, 'ps'); setPsPhotoUrl(url); }
                    catch (e) { setRepairError(e instanceof Error ? e.message : 'Photo upload failed. Try again.'); }
                    finally { setPsUploading(false); }
                  }}
                />
              </div>
              {repairError && <p className="text-xs text-red-400">{repairError}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setRepairError(''); setWizardStep(1); }}
                  className="flex-1 py-2 rounded-lg text-xs font-medium text-zinc-400"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #27272a' }}
                >Back</button>
                <button
                  disabled={!boardPhotoUrl || boardUploading}
                  onClick={() => { setRepairError(''); setWizardStep(3); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
                  style={{ background: '#f97316' }}
                >Next: Select Stage</button>
              </div>
              <p className="text-[10px] text-zinc-600 text-center">At least brainboard photo required</p>
            </div>
          )}

          {/* Step 3: Faulty Stage */}
          {wizardStep === 3 && (
            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-zinc-400 mb-2 block">Which stage / component has the fault? <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {FAULT_STAGES.map(s => (
                    <button key={s.value} type="button"
                      onClick={() => { setFaultStage(s.value); setRepairError(''); }}
                      className="px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors text-left"
                      style={
                        faultStage === s.value
                          ? s.value === 'DEAD'
                            ? { background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#f87171' }
                            : { background: 'rgba(249,115,22,0.15)', border: '1px solid #f97316', color: '#fb923c' }
                          : { background: 'transparent', border: '1px solid #27272a', color: '#71717a' }
                      }
                    >{s.label}</button>
                  ))}
                </div>
              </div>

              {/* BOM preview */}
              {faultStage && faultStage !== 'DEAD' && data.unit && (
                <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #27272a' }}>
                  {bomLoading ? (
                    <p className="text-[10px] text-zinc-500">Loading BOM…</p>
                  ) : bomItems.length > 0 ? (
                    <>
                      <p className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">
                        BOM Components for this stage
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {bomItems.map(b => (
                          <span key={b.rawMaterialId} className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: b.currentStock >= b.quantityRequired ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                              color:      b.currentStock >= b.quantityRequired ? '#22c55e' : '#ef4444',
                              border:     b.currentStock >= b.quantityRequired ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.2)',
                            }}
                          >
                            {b.materialName} × {b.quantityRequired}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-[10px] text-zinc-600">No BOM defined for this stage — all components available</p>
                  )}
                </div>
              )}

              {/* Fault Type Selection */}
              {faultStage && faultStage !== 'DEAD' && (
                <div className="mt-3">
                  <label className="text-[10px] text-zinc-400 mb-2 block">Fault Type <span className="text-red-400">*</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button"
                      onClick={() => setFaultTypeChoice('MANUFACTURING_DEFECT')}
                      className="px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors text-left"
                      style={faultTypeChoice === 'MANUFACTURING_DEFECT'
                        ? { background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#f87171' }
                        : { background: 'transparent', border: '1px solid #27272a', color: '#71717a' }}>
                      Manufacturing Defect
                    </button>
                    <button type="button"
                      onClick={() => setFaultTypeChoice('CUSTOMER_DAMAGE')}
                      className="px-3 py-2.5 rounded-lg text-xs font-medium border transition-colors text-left"
                      style={faultTypeChoice === 'CUSTOMER_DAMAGE'
                        ? { background: 'rgba(251,191,36,0.15)', border: '1px solid #fbbf24', color: '#fbbf24' }
                        : { background: 'transparent', border: '1px solid #27272a', color: '#71717a' }}>
                      Customer Damage
                    </button>
                  </div>
                  {faultTypeChoice === 'CUSTOMER_DAMAGE' && (
                    <p className="text-[10px] text-amber-400 mt-1.5">
                      Requires approval from Sales or Admin before repair can begin.
                    </p>
                  )}
                </div>
              )}

              {repairError && <p className="text-xs text-red-400">{repairError}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setRepairError(''); setWizardStep(2); }}
                  className="flex-1 py-2 rounded-lg text-xs font-medium text-zinc-400"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #27272a' }}
                >Back</button>
                <button disabled={!faultStage || (faultStage !== 'DEAD' && !faultTypeChoice)}
                  onClick={() => { setRepairError(''); setWizardStep(4); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
                  style={{ background: '#f97316' }}
                >Next: Describe Issue</button>
              </div>
            </div>
          )}

          {/* Step 4: Describe Issue */}
          {wizardStep === 4 && (
            <div className="space-y-4">
              {faultStage === 'DEAD' ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <label className="text-xs font-semibold text-red-400">Dead Controller — State reason <span className="text-red-400">*</span></label>
                  </div>
                  <textarea
                    className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-red-500"
                    style={{ background: '#18181b', border: '1px solid rgba(239,68,68,0.4)', minHeight: 100 }}
                    placeholder="e.g. completely non-functional, burnt MOSFET, no power output, board physically damaged..."
                    value={deadReason} onChange={e => setDeadReason(e.target.value)}
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[10px] text-zinc-400 mb-1 block">
                    What fault did you find in <span className="text-orange-400">{FAULT_STAGES.find(s => s.value === faultStage)?.label}</span>? <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
                    style={{ background: '#18181b', border: '1px solid #27272a', minHeight: 100 }}
                    placeholder="Root cause, component failure, fault details, observations..."
                    value={issueText} onChange={e => setIssueText(e.target.value)}
                  />
                </div>
              )}
              {repairError && <p className="text-xs text-red-400">{repairError}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setRepairError(''); setWizardStep(3); }}
                  className="flex-1 py-2 rounded-lg text-xs font-medium text-zinc-400"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #27272a' }}
                >Back</button>
                <button
                  disabled={faultStage === 'DEAD' ? !deadReason.trim() : !issueText.trim()}
                  onClick={() => { setRepairError(''); setWizardStep(5); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
                  style={{ background: '#f97316' }}
                >Next: Confirm Unit</button>
              </div>
            </div>
          )}

          {/* Step 5: Barcode Confirmation */}
          {wizardStep === 5 && (
            <div className="space-y-4">
              <div className="rounded-lg p-3 space-y-1.5" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.15)' }}>
                <p className="text-[9px] font-semibold text-sky-500 uppercase tracking-wider">Diagnosis Summary</p>
                <p className="text-xs text-sky-300 font-mono">
                  {faultStage === 'DEAD' ? `[Dead Controller] ${deadReason}` : `[${FAULT_STAGES.find(s => s.value === faultStage)?.label}] ${issueText}`}
                </p>
              </div>

              <div>
                <label className="text-[10px] text-zinc-400 mb-1.5 block">
                  Scan / Enter unit barcode to confirm identity <span className="text-red-400">*</span>
                </label>
                <p className="text-[10px] text-zinc-600 mb-2">
                  Expected: <span className="font-mono text-zinc-400">{expectedSerial || '(manual entry — no confirmation needed)'}</span>
                </p>
                <input
                  type="text"
                  value={barcodeConfirm}
                  onChange={e => setBarcodeConfirm(e.target.value.toUpperCase())}
                  placeholder="Scan barcode or type serial number…"
                  autoFocus
                  className="w-full rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:ring-1"
                  style={{
                    background: '#18181b',
                    border: barcodeConfirm && !barcodeOk ? '1px solid #ef4444' : barcodeOk && barcodeConfirm ? '1px solid #22c55e' : '1px solid #27272a',
                  }}
                />
                {barcodeConfirm && (
                  <p className="text-[10px] mt-1 font-medium" style={{ color: barcodeOk ? '#22c55e' : '#ef4444' }}>
                    {barcodeOk ? 'Unit confirmed' : 'Barcode mismatch — check the unit'}
                  </p>
                )}
              </div>

              {repairError && <p className="text-xs text-red-400">{repairError}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setRepairError(''); setWizardStep(4); }}
                  className="flex-1 py-2 rounded-lg text-xs font-medium text-zinc-400"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #27272a' }}
                >Back</button>
                <button
                  onClick={startRepair}
                  disabled={repairLoading || (!!expectedSerial && !barcodeOk)}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
                  style={{ background: faultStage === 'DEAD' ? '#ef4444' : '#f97316' }}
                >
                  {repairLoading ? 'Starting…' : faultStage === 'DEAD' ? 'Log Dead Controller' : 'Start Repair'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Complete Repair Form */}
      {(isEmployee || isAdminOrManager) && openLog && !openLog.completedAt && (
        <div className="card p-4 space-y-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
            {isAdminOrManager ? 'Complete Open Repair' : 'Complete Repair'}
          </p>
          <div className="p-2 rounded-md text-xs text-amber-200" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)' }}>
            <span className="font-medium text-amber-400">Open: </span>{openLog.issue}
            {isAdminOrManager && <span className="text-zinc-500"> — by {openLog.employee.name}</span>}
          </div>
          <textarea
            className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
            style={{ background: '#18181b', border: '1px solid #27272a', minHeight: 80 }}
            placeholder="Describe what was repaired / replaced / fixed..."
            value={workDone} onChange={e => setWorkDone(e.target.value)}
          />
          {/* After photo */}
          <PhotoCapture
            label="After Photo — repaired unit"
            hint="Capture the unit after repair is complete."
            photoUrl={afterPhotoUrl}
            uploading={afterUploading}
            onFile={async (f) => {
              setAfterUploading(true);
              try { const url = await uploadPhoto(f, 'after'); setAfterPhotoUrl(url); }
              catch { /* ignore */ }
              finally { setAfterUploading(false); }
            }}
          />
          {completeError && <p className="text-xs text-red-400">{completeError}</p>}
          <button
            onClick={completeRepair}
            disabled={completeLoading || !workDone.trim()}
            className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
            style={{ background: '#22c55e' }}
          >{completeLoading ? 'Completing…' : 'Mark Repair Complete'}</button>
        </div>
      )}

      {/* ── Materials / Components Section ── */}
      {!['SALES'].includes(role) && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
              Components Required
              {materials.filter(m => m.status === 'PENDING').length > 0 && (
                <span className="ml-2 text-amber-400">· {materials.filter(m => m.status === 'PENDING').length} pending</span>
              )}
            </p>
            {!TERMINAL.includes(data.status) && (isEmployee || isAdminOrManager) && (
              <button
                onClick={() => setShowMatForm(v => !v)}
                className="text-[10px] font-semibold px-2 py-1 rounded-md transition-colors"
                style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', color: '#38bdf8' }}
              >+ Request Component</button>
            )}
          </div>

          {/* Request form */}
          {showMatForm && (
            <div className="space-y-2 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid #27272a' }}>

              {/* BOM mode — show predefined items from BOM */}
              {useBom && !matBomLoading ? (
                <div className="space-y-2">
                  <p className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
                    BOM Components — {FAULT_STAGES.find(s => s.value === activeFaultStage)?.label}
                  </p>
                  <div className="space-y-1.5">
                    {matBomItems.map(b => {
                      const alreadyRequested = materials.some(m => m.materialName === b.materialName && m.status !== 'CANCELLED');
                      const isSelected = selectedMat?.id === b.rawMaterialId;
                      return (
                        <button
                          key={b.rawMaterialId}
                          type="button"
                          disabled={alreadyRequested}
                          onClick={() => {
                            if (alreadyRequested) return;
                            setSelectedMat({ id: b.rawMaterialId, code: b.code, name: b.materialName, unit: b.unit, currentStock: b.currentStock, minimumStock: b.minimumStock });
                            setMatQty(String(b.quantityRequired));
                          }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-colors disabled:opacity-40"
                          style={
                            alreadyRequested
                              ? { background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', cursor: 'not-allowed' }
                              : isSelected
                              ? { background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)' }
                              : { background: 'rgba(255,255,255,0.02)', border: '1px solid #27272a' }
                          }
                        >
                          <div>
                            <p className="text-xs text-white font-medium">{b.materialName}</p>
                            <p className="text-[10px] text-zinc-500 font-mono">{b.code}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-semibold text-zinc-300">
                              Qty: {b.quantityRequired} {b.unit}
                            </p>
                            {!isEmployee && (
                              <p className="text-[10px]" style={{ color: b.currentStock >= b.quantityRequired ? '#22c55e' : '#ef4444' }}>
                                Stock: {b.currentStock}
                              </p>
                            )}
                          </div>
                          {alreadyRequested && (
                            <span className="text-[10px] text-emerald-400 ml-2 shrink-0">Requested</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {selectedMat && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md" style={{
                        background: 'rgba(14,165,233,0.06)',
                        border: '1px solid rgba(14,165,233,0.2)',
                      }}>
                        <span className="text-xs text-white flex-1">{selectedMat.name}</span>
                        {!isEmployee && (
                          <span className={`text-[10px] font-semibold ${selectedMat.currentStock <= selectedMat.minimumStock ? 'text-red-400' : 'text-emerald-400'}`}>
                            {selectedMat.currentStock <= selectedMat.minimumStock ? 'Low: ' : 'Stock: '}{selectedMat.currentStock} {selectedMat.unit}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="number" min="0.001" step="any"
                          max={matBomItems.find(b => b.rawMaterialId === selectedMat.id)?.quantityRequired}
                          value={matQty} onChange={e => setMatQty(e.target.value)}
                          onWheel={e => e.currentTarget.blur()}
                          placeholder={`Qty (${selectedMat.unit}) — max ${matBomItems.find(b => b.rawMaterialId === selectedMat.id)?.quantityRequired}`}
                          className="flex-1 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          style={{ background: '#18181b', border: '1px solid #27272a' }}
                        />
                        <input type="text" value={matNotes} onChange={e => setMatNotes(e.target.value)}
                          placeholder="Notes (optional)"
                          className="flex-1 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                          style={{ background: '#18181b', border: '1px solid #27272a' }}
                        />
                      </div>
                    </div>
                  )}
                  {/* Toggle to free search */}
                  <button type="button" onClick={() => setUseBom(false)}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 underline">
                    Not in BOM? Search all components
                  </button>
                </div>
              ) : (
                /* Free-search mode */
                <div className="space-y-2">
                  {matBomItems.length > 0 && (
                    <button type="button" onClick={() => setUseBom(true)}
                      className="text-[10px] text-sky-400 hover:text-sky-300 underline">
                      Use BOM list for {FAULT_STAGES.find(s => s.value === activeFaultStage)?.label}
                    </button>
                  )}
                  <div className="relative">
                    <input
                      type="text" value={matSearch} onChange={e => onMatSearchChange(e.target.value)}
                      placeholder="Search component name…"
                      className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      style={{ background: '#18181b', border: '1px solid #27272a' }}
                    />
                    {matSearchLoading && <span className="absolute right-3 top-2 text-[10px] text-zinc-500">…</span>}
                    {matOptions.length > 0 && !selectedMat && (
                      <div className="absolute z-50 w-full mt-1 rounded-lg border border-zinc-700 overflow-y-auto" style={{ background: '#18181b', maxHeight: 220, bottom: 'auto' }}>
                        {matOptions.map(o => (
                          <button key={o.id} type="button"
                            onClick={() => { setSelectedMat(o); setMatSearch(o.name); setMatOptions([]); }}
                            className="w-full px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-white">{o.name}</span>
                              {!isEmployee && (
                                <span className={`text-[10px] font-medium ${o.currentStock <= o.minimumStock ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {o.currentStock} {o.unit}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-zinc-500 font-mono">{o.code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedMat && (
                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md" style={{
                      background: 'rgba(14,165,233,0.06)',
                      border: '1px solid rgba(14,165,233,0.2)',
                    }}>
                      <span className="text-xs text-white flex-1">{selectedMat.name}</span>
                      {!isEmployee && (
                        <span className={`text-[10px] font-semibold ${selectedMat.currentStock <= selectedMat.minimumStock ? 'text-red-400' : 'text-emerald-400'}`}>
                          {selectedMat.currentStock <= selectedMat.minimumStock ? 'Low: ' : 'Stock: '}{selectedMat.currentStock} {selectedMat.unit}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="number" min="0.001" step="any"
                      value={matQty} onChange={e => setMatQty(e.target.value)}
                      onWheel={e => e.currentTarget.blur()}
                      placeholder={`Qty (${selectedMat?.unit ?? 'unit'})`}
                      className="flex-1 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      style={{ background: '#18181b', border: '1px solid #27272a' }}
                    />
                    <input type="text" value={matNotes} onChange={e => setMatNotes(e.target.value)}
                      placeholder="Notes (optional)"
                      className="flex-1 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      style={{ background: '#18181b', border: '1px solid #27272a' }}
                    />
                  </div>
                </div>
              )}

              {matError && <p className="text-xs text-red-400">{matError}</p>}

              <div className="flex gap-2">
                <button onClick={submitMaterialRequest} disabled={matSaving || !selectedMat || !matQty}
                  className="flex-1 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                  style={{ background: '#0ea5e9' }}
                >{matSaving ? 'Requesting…' : 'Submit Request'}</button>
                <button onClick={() => { setShowMatForm(false); setMatSearch(''); setSelectedMat(null); setMatQty(''); setMatError(''); setMatOptions([]); }}
                  className="px-4 py-2 rounded-lg text-xs text-zinc-400"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #27272a' }}
                >Cancel</button>
              </div>
            </div>
          )}

          {/* Materials list */}
          {matsLoading ? (
            <p className="text-xs text-zinc-500">Loading…</p>
          ) : materials.length === 0 ? (
            <p className="text-xs text-zinc-600">No components requested yet.</p>
          ) : (
            <div className="space-y-2">
              {materials.map(m => {
                const isPending   = m.status === 'PENDING';
                const isIssued    = m.status === 'ISSUED';
                const isCancelled = m.status === 'CANCELLED';
                const isLow = m.currentStock <= 0;
                return (
                  <div key={m.id} className="rounded-lg px-3 py-2.5" style={{
                    background: isIssued ? 'rgba(34,197,94,0.06)' : isCancelled ? 'rgba(113,113,122,0.06)' : isLow ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                    border:     isIssued ? '1px solid rgba(34,197,94,0.2)' : isCancelled ? '1px solid rgba(113,113,122,0.15)' : isLow ? '1px solid rgba(239,68,68,0.2)' : '1px solid #27272a',
                  }}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-white">{m.materialName}</span>
                          <span className="text-[10px] font-semibold" style={{ color: isIssued ? '#22c55e' : isCancelled ? '#71717a' : '#fbbf24' }}>
                            {isIssued ? 'Issued' : isCancelled ? 'Cancelled' : 'Pending'}
                          </span>
                          {isPending && isLow && <span className="text-[10px] text-red-400 font-medium">Low Stock</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-zinc-400">
                            {m.qtyRequested} {m.unit} requested
                            {isIssued && m.qtyIssued > 0 && ` · ${m.qtyIssued} ${m.unit} issued`}
                          </span>
                          {isPending && !isEmployee && <span className="text-[10px] text-zinc-600">Stock: {m.currentStock} {m.unit}</span>}
                        </div>
                        {m.notes && <p className="text-[10px] text-zinc-500 mt-0.5">{m.notes}</p>}
                        <p className="text-[9px] text-zinc-600 mt-0.5">
                          Requested by {m.requestedBy.name}
                          {isIssued && m.issuedBy && ` · Issued by ${m.issuedBy.name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isPending && ['ADMIN', 'STORE_MANAGER', 'PRODUCTION_MANAGER'].includes(role) && (
                          <button onClick={() => issueMaterial(m.id)}
                            className="text-[10px] px-2 py-1 rounded font-semibold transition-colors"
                            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}
                          >Issue</button>
                        )}
                        {isPending && (
                          <button onClick={() => deleteMaterial(m.id)}
                            className="text-[10px] px-2 py-1 rounded font-semibold transition-colors"
                            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
                          >Remove</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
