'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Clock, Wrench, Package, XCircle, ChevronRight, Pencil, Trash2 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type RepairLog = {
  id: string;
  issue: string;
  workDone: string | null;
  startedAt: string;
  completedAt: string | null;
  employee: { id: string; name: string };
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
  createdAt: string;
  updatedAt: string;
  client: { code: string; customerName: string };
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

// Role-based next status options
function getNextActions(status: string, role: string): { label: string; value: string; color: string }[] {
  const isAdminOrManager = ['ADMIN', 'PRODUCTION_MANAGER'].includes(role);
  const isEmployee = role === 'PRODUCTION_EMPLOYEE';
  const isSales = role === 'SALES';

  switch (status) {
    case 'REPORTED':
      if (isAdminOrManager || isSales) return [
        { label: 'Mark Evaluated', value: 'EVALUATED', color: '#38bdf8' },
        { label: 'Reject', value: 'REJECTED', color: '#ef4444' },
      ];
      break;
    case 'EVALUATED':
      if (isAdminOrManager) return [
        { label: 'Approve', value: 'APPROVED', color: '#22c55e' },
        { label: 'Reject', value: 'REJECTED', color: '#ef4444' },
      ];
      break;
    case 'APPROVED':
      if (isAdminOrManager || isEmployee) return [
        { label: 'Mark Unit Received', value: 'UNIT_RECEIVED', color: '#a855f7' },
        { label: 'Start Repair Directly', value: 'IN_REPAIR', color: '#f97316' },
      ];
      break;
    case 'UNIT_RECEIVED':
      if (isAdminOrManager || isEmployee) return [
        { label: 'Start Repair', value: 'IN_REPAIR', color: '#f97316' },
      ];
      break;
    case 'REPAIRED':
      if (isAdminOrManager) return [
        { label: 'Mark QC Checked', value: 'QC_CHECKED', color: '#38bdf8' },
        { label: 'Close', value: 'CLOSED', color: '#a1a1aa' },
      ];
      break;
    case 'QC_CHECKED':
      if (isAdminOrManager) return [
        { label: 'Mark Dispatched', value: 'DISPATCHED', color: '#6366f1' },
        { label: 'Close', value: 'CLOSED', color: '#a1a1aa' },
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

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-white">{log.employee.name}</span>
        <span className="text-[10px] text-zinc-500">{started}</span>
      </div>
      <div className="p-2 rounded-md" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)' }}>
        <p className="text-[9px] font-semibold text-amber-500 uppercase tracking-wider mb-0.5">Diagnosis / Issue Found</p>
        <p className="text-xs text-amber-200">{log.issue}</p>
      </div>
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

  // Evaluation form (admin/manager/sales)
  const [evalNotes, setEvalNotes]   = useState(data.evaluationNotes ?? '');
  const [resolution, setResolution] = useState(data.resolution ?? '');
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError]   = useState('');

  // Status transition
  const [actionLoading, setActionLoading] = useState('');
  const [actionError, setActionError]     = useState('');

  // Start repair form (production employee)
  const [issueText, setIssueText]       = useState('');
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairError, setRepairError]   = useState('');

  // Complete repair form
  const [completeLogId, setCompleteLogId] = useState('');
  const [workDone, setWorkDone]           = useState('');
  const [completeLoading, setCompleteLoading] = useState(false);
  const [completeError, setCompleteError]     = useState('');

  const isAdminOrManager = ['ADMIN', 'PRODUCTION_MANAGER'].includes(role);
  const isEmployee = role === 'PRODUCTION_EMPLOYEE';
  const isSales = role === 'SALES';

  const LOCKED_STATUSES = ['IN_REPAIR', 'REPAIRED', 'QC_CHECKED', 'DISPATCHED', 'CLOSED'];
  const canEditDelete = ['ADMIN', 'SALES'].includes(role) && !LOCKED_STATUSES.includes(data.status);

  // Edit form state
  const [showEdit,       setShowEdit]       = useState(false);
  const [editSerial,     setEditSerial]     = useState(data.serialNumber ?? '');
  const [editIssue,      setEditIssue]      = useState(data.reportedIssue);
  const [editLoading,    setEditLoading]    = useState(false);
  const [editError,      setEditError]      = useState('');

  // Delete state
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [deleteLoading,  setDeleteLoading]  = useState(false);
  const [deleteError,    setDeleteError]    = useState('');

  const openLog = data.repairLogs.find(l => !l.completedAt);
  const nextActions = getNextActions(data.status, role);

  // ── Handlers ──

  async function saveEvaluation() {
    if (!evalNotes.trim() && !resolution) return;
    setEvalLoading(true);
    setEvalError('');
    try {
      const res = await fetch(`/api/returns/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluationNotes: evalNotes || undefined,
          resolution: resolution || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setEvalError(j.error ?? 'Failed to save evaluation');
      } else {
        router.refresh();
      }
    } catch {
      setEvalError('Network error');
    } finally {
      setEvalLoading(false);
    }
  }

  async function advanceStatus(status: string) {
    setActionLoading(status);
    setActionError('');
    try {
      const res = await fetch(`/api/returns/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json();
        setActionError(j.error ?? 'Failed to update status');
      } else {
        router.refresh();
      }
    } catch {
      setActionError('Network error');
    } finally {
      setActionLoading('');
    }
  }

  async function startRepair() {
    if (!issueText.trim()) return;
    setRepairLoading(true);
    setRepairError('');
    try {
      const res = await fetch(`/api/returns/${data.id}/repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue: issueText }),
      });
      if (!res.ok) {
        const j = await res.json();
        setRepairError(j.error ?? 'Failed to log repair');
      } else {
        setIssueText('');
        router.refresh();
      }
    } catch {
      setRepairError('Network error');
    } finally {
      setRepairLoading(false);
    }
  }

  async function completeRepair() {
    if (!completeLogId || !workDone.trim()) return;
    setCompleteLoading(true);
    setCompleteError('');
    try {
      const res = await fetch(`/api/returns/${data.id}/repair`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repairLogId: completeLogId, workDone }),
      });
      if (!res.ok) {
        const j = await res.json();
        setCompleteError(j.error ?? 'Failed to complete repair');
      } else {
        setCompleteLogId('');
        setWorkDone('');
        router.refresh();
      }
    } catch {
      setCompleteError('Network error');
    } finally {
      setCompleteLoading(false);
    }
  }

  async function saveEdit() {
    if (!editSerial.trim() || !editIssue.trim()) return;
    setEditLoading(true);
    setEditError('');
    try {
      const res = await fetch(`/api/returns/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serialNumber:  editSerial.trim(),
          reportedIssue: editIssue.trim(),
        }),
      });
      if (!res.ok) {
        const j = await res.json();
        setEditError(j.error ?? 'Failed to save');
      } else {
        setShowEdit(false);
        router.refresh();
      }
    } catch {
      setEditError('Network error');
    } finally {
      setEditLoading(false);
    }
  }

  async function deleteReturn() {
    setDeleteLoading(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/returns/${data.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json();
        setDeleteError(j.error ?? 'Failed to delete');
        setDeleteLoading(false);
      } else {
        router.push('/rework');
      }
    } catch {
      setDeleteError('Network error');
      setDeleteLoading(false);
    }
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
            <span
              className="text-[10px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: st.bg, color: st.color }}
            >
              {st.text}
            </span>
            <span className="text-[10px] text-zinc-500">{date}</span>
          </div>
          <h1 className="text-lg font-bold text-white mt-1">{data.client.customerName}</h1>
          <p className="text-xs text-zinc-500 font-mono">{data.client.code}</p>
        </div>
        <button
          onClick={() => router.back()}
          className="text-xs text-zinc-500 hover:text-white transition-colors shrink-0 mt-1"
        >
          ← Back
        </button>
      </div>

      {/* Edit / Delete actions — only before IN_REPAIR */}
      {canEditDelete && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowEdit(v => !v); setEditError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#38bdf8' }}
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
          <button
            onClick={() => { setConfirmDelete(true); setDeleteError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      )}

      {/* Edit form */}
      {showEdit && canEditDelete && (
        <div className="card p-4 space-y-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Edit Request</p>
          <div>
            <label className="text-[10px] text-zinc-400 mb-1 block">Serial Number</label>
            <input
              type="text"
              value={editSerial}
              onChange={e => setEditSerial(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-xs text-white font-mono placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
              style={{ background: '#18181b', border: '1px solid #27272a' }}
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 mb-1 block">Reported Issue</label>
            <textarea
              value={editIssue}
              onChange={e => setEditIssue(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
              style={{ background: '#18181b', border: '1px solid #27272a', minHeight: 72 }}
            />
          </div>
          {editError && <p className="text-xs text-red-400">{editError}</p>}
          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              disabled={editLoading || !editSerial.trim() || !editIssue.trim()}
              className="flex-1 py-2 rounded-lg text-xs font-medium text-white transition-opacity disabled:opacity-40"
              style={{ background: '#0ea5e9' }}
            >
              {editLoading ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              onClick={() => setShowEdit(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 transition-colors hover:text-white"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #27272a' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="card p-4 space-y-3" style={{ border: '1px solid rgba(239,68,68,0.3)' }}>
          <p className="text-sm font-medium text-red-400">Delete this replacement request?</p>
          <p className="text-xs text-zinc-500">This cannot be undone. All associated data will be removed.</p>
          {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
          <div className="flex gap-2">
            <button
              onClick={deleteReturn}
              disabled={deleteLoading}
              className="flex-1 py-2 rounded-lg text-xs font-medium text-white transition-opacity disabled:opacity-40"
              style={{ background: '#ef4444' }}
            >
              {deleteLoading ? 'Deleting…' : 'Yes, Delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 transition-colors hover:text-white"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #27272a' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="card p-4">
        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Progress</p>
        <StatusBar status={data.status} />
      </div>

      {/* Unit / Product Info */}
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

      {/* Evaluation Section — admins, managers, sales can fill */}
      {(isAdminOrManager || isSales) && (
        <div className="card p-4 space-y-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Evaluation</p>

          {data.evaluatedBy && (
            <p className="text-[10px] text-zinc-500">Evaluated by <span className="text-zinc-300">{data.evaluatedBy.name}</span></p>
          )}

          {/* Resolution */}
          <div>
            <label className="text-[10px] text-zinc-400 mb-1 block">Resolution Type</label>
            <div className="grid grid-cols-2 gap-2">
              {(['REPAIR', 'REPLACE', 'REFUND', 'CREDIT_NOTE'] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setResolution(resolution === r ? '' : r)}
                  className="px-3 py-2 rounded-lg text-xs font-medium border transition-colors"
                  style={
                    resolution === r
                      ? { background: 'rgba(14,165,233,0.15)', border: '1px solid #0ea5e9', color: '#38bdf8' }
                      : { background: 'transparent', border: '1px solid #27272a', color: '#71717a' }
                  }
                >
                  {RESOLUTION_LABELS[r]}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] text-zinc-400 mb-1 block">Evaluation Notes</label>
            <textarea
              className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
              style={{ background: '#18181b', border: '1px solid #27272a', minHeight: 72 }}
              placeholder="Describe your findings..."
              value={evalNotes}
              onChange={e => setEvalNotes(e.target.value)}
            />
          </div>

          {evalError && <p className="text-xs text-red-400">{evalError}</p>}

          {!TERMINAL.includes(data.status) && (
            <button
              onClick={saveEvaluation}
              disabled={evalLoading || (!evalNotes.trim() && !resolution)}
              className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
              style={{ background: '#0ea5e9' }}
            >
              {evalLoading ? 'Saving…' : 'Save Evaluation'}
            </button>
          )}
        </div>
      )}

      {/* Read-only evaluation summary for employees */}
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

      {/* Status Action Buttons */}
      {nextActions.length > 0 && !TERMINAL.includes(data.status) && (
        <div className="card p-4 space-y-2">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Advance Status</p>
          {actionError && <p className="text-xs text-red-400 mb-2">{actionError}</p>}
          <div className="flex flex-wrap gap-2">
            {nextActions.map(action => (
              <button
                key={action.value}
                onClick={() => advanceStatus(action.value)}
                disabled={!!actionLoading}
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

        {data.repairLogs.map(log => (
          <RepairLogCard key={log.id} log={log} />
        ))}
      </div>

      {/* Start Repair Form — production employee */}
      {isEmployee && !TERMINAL.includes(data.status) && ['APPROVED', 'UNIT_RECEIVED', 'IN_REPAIR', 'EVALUATED'].includes(data.status) && !openLog && (
        <div className="card p-4 space-y-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Log Diagnosis</p>
          <textarea
            className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
            style={{ background: '#18181b', border: '1px solid #27272a', minHeight: 80 }}
            placeholder="Describe what you found — root cause, fault details..."
            value={issueText}
            onChange={e => setIssueText(e.target.value)}
          />
          {repairError && <p className="text-xs text-red-400">{repairError}</p>}
          <button
            onClick={startRepair}
            disabled={repairLoading || !issueText.trim()}
            className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
            style={{ background: '#f97316' }}
          >
            {repairLoading ? 'Logging…' : 'Start Repair'}
          </button>
        </div>
      )}

      {/* Complete Repair Form — production employee, when there's an open log */}
      {isEmployee && openLog && !openLog.completedAt && (
        <div className="card p-4 space-y-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Complete Repair</p>
          <div className="p-2 rounded-md text-xs text-amber-200" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)' }}>
            <span className="font-medium text-amber-400">Open diagnosis: </span>{openLog.issue}
          </div>
          <textarea
            className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
            style={{ background: '#18181b', border: '1px solid #27272a', minHeight: 80 }}
            placeholder="Describe what was repaired / replaced / fixed..."
            value={workDone}
            onChange={e => setWorkDone(e.target.value)}
          />
          {completeError && <p className="text-xs text-red-400">{completeError}</p>}
          <button
            onClick={() => { setCompleteLogId(openLog.id); completeRepair(); }}
            disabled={completeLoading || !workDone.trim()}
            className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
            style={{ background: '#22c55e' }}
          >
            {completeLoading ? 'Completing…' : 'Mark Repair Complete'}
          </button>
        </div>
      )}

      {/* Admins/managers can also log repairs */}
      {isAdminOrManager && !TERMINAL.includes(data.status) && ['APPROVED', 'UNIT_RECEIVED', 'IN_REPAIR', 'EVALUATED'].includes(data.status) && !openLog && (
        <div className="card p-4 space-y-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Log Repair Entry</p>
          <textarea
            className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
            style={{ background: '#18181b', border: '1px solid #27272a', minHeight: 80 }}
            placeholder="Describe what was found / repaired..."
            value={issueText}
            onChange={e => setIssueText(e.target.value)}
          />
          {repairError && <p className="text-xs text-red-400">{repairError}</p>}
          <button
            onClick={startRepair}
            disabled={repairLoading || !issueText.trim()}
            className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
            style={{ background: '#f97316' }}
          >
            {repairLoading ? 'Logging…' : 'Log Repair'}
          </button>
        </div>
      )}

      {/* Complete Repair — admin/manager view of open log */}
      {isAdminOrManager && openLog && !openLog.completedAt && (
        <div className="card p-4 space-y-3">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Complete Open Repair</p>
          <div className="p-2 rounded-md text-xs text-amber-200" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)' }}>
            <span className="font-medium text-amber-400">Open: </span>{openLog.issue}
            <span className="text-zinc-500"> — by {openLog.employee.name}</span>
          </div>
          <textarea
            className="w-full rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-sky-500"
            style={{ background: '#18181b', border: '1px solid #27272a', minHeight: 80 }}
            placeholder="Work done..."
            value={workDone}
            onChange={e => setWorkDone(e.target.value)}
          />
          {completeError && <p className="text-xs text-red-400">{completeError}</p>}
          <button
            onClick={() => { setCompleteLogId(openLog.id); completeRepair(); }}
            disabled={completeLoading || !workDone.trim()}
            className="w-full py-2 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-40"
            style={{ background: '#22c55e' }}
          >
            {completeLoading ? 'Completing…' : 'Mark Repair Complete'}
          </button>
        </div>
      )}

      {/* Closed/Rejected terminal state */}
      {TERMINAL.includes(data.status) && (
        <div
          className="card p-4 flex items-center gap-3"
          style={
            data.status === 'CLOSED'
              ? { background: 'rgba(113,113,122,0.08)', border: '1px solid rgba(113,113,122,0.2)' }
              : { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }
          }
        >
          {data.status === 'CLOSED'
            ? <CheckCircle className="w-4 h-4 text-zinc-400 shrink-0" />
            : <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          }
          <p className="text-sm font-medium" style={{ color: data.status === 'CLOSED' ? '#a1a1aa' : '#ef4444' }}>
            {data.status === 'CLOSED' ? 'Return closed' : 'Return rejected'}
          </p>
        </div>
      )}
    </div>
  );
}
