'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────
type InvoiceItem = { invoiceNumber: string; notes: string | null };

type DOListItem = {
  id:             string;
  doNumber:       string;
  status:         string;
  dispatchQty:    number;
  totalBoxes:     number | null;
  createdAt:      string;
  submittedAt:    string | null;
  approvedAt:     string | null;
  rejectedReason: string | null;
  order: {
    orderNumber: string;
    quantity:    number;
    client:      { customerName: string } | null;
    product:     { code: string; name: string };
  };
  createdBy:  { name: string };
  approvedBy: { name: string } | null;
  boxes:      { _count: { items: number } }[];
  invoices?:  InvoiceItem[];
};

type Tab = 'topack' | 'processing' | 'completed';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getTracking(invoices: InvoiceItem[] | undefined): string | null {
  if (!invoices) return null;
  for (const inv of invoices) {
    if (!inv.notes) continue;
    const match = inv.notes.match(/^Tracking:\s*(.+)$/m);
    if (match) return match[1].trim();
  }
  return null;
}

// ─── DOStatusBadge ────────────────────────────────────────────────────────────
function DOStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    OPEN:      { label: 'Open',      color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
    PACKING:   { label: 'Packing',   color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
    SUBMITTED: { label: 'Submitted', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
    APPROVED:  { label: 'Approved',  color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
    REJECTED:  { label: 'Rejected',  color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  };
  const c = cfg[status] ?? cfg.OPEN;
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ color: c.color, background: c.bg }}>
      {c.label}
    </span>
  );
}

function PartialBadge({ dispatchQty, orderQty }: { dispatchQty: number; orderQty: number }) {
  if (!dispatchQty || dispatchQty >= orderQty) return null;
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
      style={{ color: '#fb923c', background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.3)' }}>
      PARTIAL {dispatchQty}/{orderQty}
    </span>
  );
}

// ─── RejectModal ──────────────────────────────────────────────────────────────
function RejectModal({ doNumber, onConfirm, onCancel }: {
  doNumber:  string;
  onConfirm: (reason: string) => void;
  onCancel:  () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-xl p-6 w-full max-w-sm space-y-4" style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div>
          <div className="text-white font-semibold">Reject {doNumber}</div>
          <div className="text-zinc-400 text-sm mt-1">Provide a reason for rejection. Units will be unlocked for re-packing.</div>
        </div>
        <textarea
          placeholder="Rejection reason…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full rounded-lg px-3 py-2 text-sm text-white bg-transparent outline-none resize-none"
          style={{ border: '1px solid rgba(255,255,255,0.15)' }}
          autoFocus
        />
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!reason.trim()}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: '#dc2626' }}
          >
            Confirm Reject
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main ShippingPanel ────────────────────────────────────────────────────────
export function ShippingPanel({
  sessionRole,
  sessionName,
}: {
  sessionRole:    string;
  sessionName:    string;
  initialDrafts?: unknown[];
}) {
  const router = useRouter();

  const isPacking  = sessionRole === 'PACKING';
  const canApprove = sessionRole === 'ADMIN' || sessionRole === 'ACCOUNTS';

  const [activeTab,     setActiveTab]     = useState<Tab>(isPacking ? 'topack' : 'processing');
  const [topackDOs,     setTopackDOs]     = useState<DOListItem[] | null>(null);
  const [processingDOs, setProcessingDOs] = useState<DOListItem[] | null>(null);
  const [completedDOs,  setCompletedDOs]  = useState<DOListItem[] | null>(null);
  const [loadingDOs,    setLoadingDOs]    = useState(false);

  // Approve/Reject state
  const [approvingDO,   setApprovingDO]   = useState<DOListItem | null>(null);
  const [approvingBusy, setApprovingBusy] = useState(false);
  const [rejectingDO,   setRejectingDO]   = useState<DOListItem | null>(null);
  const [actionError,   setActionError]   = useState('');
  const [successMsg,    setSuccessMsg]    = useState('');

  // Tracking state — keyed by DO id
  const [trackingInputs,  setTrackingInputs]  = useState<Record<string, string>>({});
  const [trackingEditing, setTrackingEditing] = useState<Record<string, boolean>>({});
  const [trackingBusy,    setTrackingBusy]    = useState<Record<string, boolean>>({});
  const [trackingError,   setTrackingError]   = useState<Record<string, string>>({});

  // Generate invoice state — keyed by DO id
  const [genInvBusy,  setGenInvBusy]  = useState<Record<string, boolean>>({});
  const [genInvError, setGenInvError] = useState<Record<string, string>>({});

  async function loadDOs(tab: Tab) {
    setLoadingDOs(true);
    try {
      let url = '';
      if (tab === 'topack')     url = '/api/dispatch-orders?status=OPEN,PACKING';
      if (tab === 'processing') url = '/api/dispatch-orders?status=SUBMITTED';
      if (tab === 'completed')  url = '/api/dispatch-orders?status=APPROVED,REJECTED';
      if (!url) return;
      const res  = await fetch(url);
      const data = await res.json() as DOListItem[];
      if (tab === 'topack')     setTopackDOs(Array.isArray(data)     ? data : []);
      if (tab === 'processing') setProcessingDOs(Array.isArray(data) ? data : []);
      if (tab === 'completed')  setCompletedDOs(Array.isArray(data)  ? data : []);
    } finally {
      setLoadingDOs(false);
    }
  }

  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    setActionError('');
    setSuccessMsg('');
    if (tab === 'topack'     && topackDOs     === null) loadDOs('topack');
    if (tab === 'processing' && processingDOs === null) loadDOs('processing');
    if (tab === 'completed'  && completedDOs  === null) loadDOs('completed');
  }

  useEffect(() => { loadDOs(activeTab); }, []);

  // ── Approve ──
  async function handleApprove(d: DOListItem) {
    setActionError('');
    setSuccessMsg('');
    setApprovingBusy(true);
    try {
      const res  = await fetch(`/api/dispatch-orders/${d.id}/approve`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json() as { error?: string; generatedInvoiceNumbers?: string[]; noProforma?: boolean };
      if (!res.ok) { setActionError(data.error ?? 'Approval failed'); setApprovingDO(null); return; }
      setApprovingDO(null);
      setProcessingDOs((prev) => prev ? prev.filter((x) => x.id !== d.id) : prev);
      setCompletedDOs(null); // force reload next visit
      if (data.generatedInvoiceNumbers && data.generatedInvoiceNumbers.length > 0) {
        setSuccessMsg(`Approved! Invoice${data.generatedInvoiceNumbers.length > 1 ? 's' : ''}: ${data.generatedInvoiceNumbers.join(', ')}`);
      } else if (data.noProforma) {
        setSuccessMsg('Approved! No proforma linked to this order — invoice not generated.');
      } else {
        setSuccessMsg('Approved!');
      }
    } catch { setActionError('Network error'); }
    finally { setApprovingBusy(false); }
  }

  // ── Reject ──
  async function handleReject(d: DOListItem, reason: string) {
    setActionError('');
    setSuccessMsg('');
    try {
      const res  = await fetch(`/api/dispatch-orders/${d.id}/approve`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'reject', rejectedReason: reason }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setActionError(data.error ?? 'Rejection failed'); return; }
      setRejectingDO(null);
      setProcessingDOs((prev) => prev ? prev.filter((x) => x.id !== d.id) : prev);
      setCompletedDOs(null);
      setSuccessMsg('Rejected and units unlocked for re-packing.');
    } catch { setActionError('Network error'); }
  }

  // ── Generate Invoice (post-approval) ──
  async function handleGenerateInvoice(d: DOListItem) {
    setGenInvBusy((p)  => ({ ...p, [d.id]: true }));
    setGenInvError((p) => ({ ...p, [d.id]: '' }));
    try {
      const res  = await fetch(`/api/dispatch-orders/${d.id}/generate-invoice`, { method: 'POST' });
      const data = await res.json() as { generatedInvoiceNumbers?: string[]; error?: string };
      if (!res.ok) { setGenInvError((p) => ({ ...p, [d.id]: data.error ?? 'Failed to generate invoice' })); return; }
      const nums = data.generatedInvoiceNumbers ?? [];
      setSuccessMsg(`Invoice${nums.length > 1 ? 's' : ''} generated: ${nums.join(', ')}`);
      setCompletedDOs(null); // force reload so invoice numbers show
      loadDOs('completed');
    } catch { setGenInvError((p) => ({ ...p, [d.id]: 'Network error' })); }
    finally { setGenInvBusy((p) => ({ ...p, [d.id]: false })); }
  }

  // ── Set Tracking ──
  async function handleSetTracking(d: DOListItem) {
    const tn = (trackingInputs[d.id] ?? '').trim();
    if (!tn) return;
    setTrackingBusy((p)  => ({ ...p, [d.id]: true }));
    setTrackingError((p) => ({ ...p, [d.id]: '' }));
    try {
      const res  = await fetch(`/api/dispatch-orders/${d.id}/tracking`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ trackingNumber: tn }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setTrackingError((p) => ({ ...p, [d.id]: data.error ?? 'Failed to save' })); return; }
      // Update local invoice notes so tracking shows immediately
      setCompletedDOs((prev) =>
        prev
          ? prev.map((x) =>
              x.id === d.id
                ? {
                    ...x,
                    invoices: (x.invoices ?? []).map((inv) => ({
                      ...inv,
                      notes: `Tracking: ${tn}\n${(inv.notes ?? '').replace(/^Tracking:.*\n?/m, '').trim()}`.trim(),
                    })),
                  }
                : x
            )
          : prev
      );
      setTrackingEditing((p) => ({ ...p, [d.id]: false }));
      setTrackingInputs((p)  => ({ ...p, [d.id]: '' }));
    } catch { setTrackingError((p) => ({ ...p, [d.id]: 'Network error' })); }
    finally { setTrackingBusy((p) => ({ ...p, [d.id]: false })); }
  }

  const tabs: { key: Tab; label: string }[] = [
    ...(isPacking ? [{ key: 'topack' as Tab, label: 'To Pack' }] : []),
    { key: 'processing', label: 'Processing' },
    { key: 'completed',  label: 'Completed' },
  ];

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Approve confirmation modal */}
      {approvingDO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-xl p-6 w-full max-w-sm space-y-4" style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div>
              <div className="text-white font-semibold">Approve &amp; Invoice</div>
              <div className="text-zinc-400 text-sm mt-1">
                Approving <span className="font-mono text-white">{approvingDO.doNumber}</span> will generate the invoice automatically from the linked proforma.
              </div>
            </div>
            {actionError && (
              <div className="text-sm text-rose-400 px-3 py-2 rounded-lg"
                style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                {actionError}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleApprove(approvingDO)}
                disabled={approvingBusy}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#16a34a' }}
              >
                {approvingBusy ? 'Processing…' : 'Confirm Approve'}
              </button>
              <button
                onClick={() => { setApprovingDO(null); setActionError(''); }}
                disabled={approvingBusy}
                className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {rejectingDO && (
        <RejectModal
          doNumber={rejectingDO.doNumber}
          onConfirm={(reason) => handleReject(rejectingDO, reason)}
          onCancel={() => { setRejectingDO(null); setActionError(''); }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Shipping</h2>
          <p className="text-sm text-zinc-400 mt-0.5">Review and manage dispatch orders</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}>
          {sessionName}
        </span>
      </div>

      {actionError && !approvingDO && (
        <div className="text-sm text-rose-400 px-3 py-2 rounded-lg"
          style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
          {actionError}
        </div>
      )}
      {successMsg && (
        <div className="text-sm text-green-400 px-3 py-2 rounded-lg"
          style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
          {successMsg}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTabChange(t.key)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-colors ${activeTab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={activeTab === t.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TO PACK (PACKING role: OPEN + PACKING DOs) ── */}
      {activeTab === 'topack' && (
        <div className="space-y-3">
          {loadingDOs && <div className="text-zinc-500 text-sm">Loading…</div>}
          {!loadingDOs && topackDOs !== null && topackDOs.length === 0 && (
            <div className="text-sm text-zinc-500 text-center py-6">No dispatch orders to pack.</div>
          )}
          {!loadingDOs && (topackDOs ?? []).map((d) => {
            const unitCount = d.boxes.reduce((sum: number, b) => sum + (b._count?.items ?? 0), 0);
            const boxCount  = d.totalBoxes ?? d.boxes.length;
            return (
              <div key={d.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm text-white">{d.doNumber}</span>
                      <DOStatusBadge status={d.status} />
                      <PartialBadge dispatchQty={d.dispatchQty} orderQty={d.order.quantity} />
                    </div>
                    <div className="text-sm text-zinc-400 mt-0.5">
                      {d.order.client?.customerName ?? '—'} · #{d.order.orderNumber}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {d.order.product.name}
                      {boxCount > 0 ? ` · ${boxCount} box${boxCount !== 1 ? 'es' : ''}` : ''}
                      {unitCount > 0 ? ` · ${unitCount} scanned` : ''}
                      {' · Created '}{fmtDate(d.createdAt)}
                    </div>
                    <div className="text-xs text-zinc-600 mt-0.5">by {d.createdBy.name}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/shipping/do/${d.id}`)}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0"
                    style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}
                  >
                    Pack →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── PROCESSING (SUBMITTED — awaiting approval) ── */}
      {activeTab === 'processing' && (
        <div className="space-y-3">
          {loadingDOs && <div className="text-zinc-500 text-sm">Loading…</div>}
          {!loadingDOs && processingDOs !== null && processingDOs.length === 0 && (
            <div className="text-sm text-zinc-500 text-center py-6">No dispatch orders pending approval.</div>
          )}
          {!loadingDOs && (processingDOs ?? []).map((d) => {
            const unitCount = d.boxes.reduce((sum: number, b) => sum + (b._count?.items ?? 0), 0);
            const boxCount  = d.totalBoxes ?? d.boxes.length;
            return (
              <div key={d.id} className="card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm text-white">{d.doNumber}</span>
                      <DOStatusBadge status={d.status} />
                      <PartialBadge dispatchQty={d.dispatchQty} orderQty={d.order.quantity} />
                    </div>
                    <div className="text-sm text-zinc-400 mt-0.5">
                      {d.order.client?.customerName ?? '—'} · #{d.order.orderNumber}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {d.order.product.name} · {boxCount} box{boxCount !== 1 ? 'es' : ''} · {unitCount} unit{unitCount !== 1 ? 's' : ''} · Submitted {fmtDate(d.submittedAt)}
                    </div>
                    <div className="text-xs text-zinc-600 mt-0.5">by {d.createdBy.name}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/shipping/do/${d.id}`)}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold shrink-0"
                    style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    View
                  </button>
                </div>

                {/* Approve / Reject — ACCOUNTS & ADMIN only */}
                {canApprove && (
                  <div className="flex gap-2 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <button
                      type="button"
                      onClick={() => { setActionError(''); setSuccessMsg(''); setApprovingDO(d); }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white"
                      style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)' }}
                    >
                      ✓ Approve &amp; Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => { setActionError(''); setSuccessMsg(''); setRejectingDO(d); }}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                      ✕ Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── COMPLETED (APPROVED + REJECTED) ── */}
      {activeTab === 'completed' && (
        <div className="space-y-3">
          {loadingDOs && <div className="text-zinc-500 text-sm">Loading…</div>}
          {!loadingDOs && completedDOs !== null && completedDOs.length === 0 && (
            <div className="text-sm text-zinc-500 text-center py-6">No dispatch history yet.</div>
          )}
          {!loadingDOs && (completedDOs ?? []).map((d) => {
            const unitCount = d.boxes.reduce((sum: number, b) => sum + (b._count?.items ?? 0), 0);
            const boxCount  = d.totalBoxes ?? d.boxes.length;
            const tracking  = getTracking(d.invoices);
            const isEditing = trackingEditing[d.id] ?? false;

            return (
              <div key={d.id} className="card p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm text-white">{d.doNumber}</span>
                      <DOStatusBadge status={d.status} />
                      <PartialBadge dispatchQty={d.dispatchQty} orderQty={d.order.quantity} />
                    </div>
                    <div className="text-sm text-zinc-400 mt-0.5">
                      {d.order.client?.customerName ?? '—'} · #{d.order.orderNumber}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {d.order.product.name} · {boxCount} box{boxCount !== 1 ? 'es' : ''} · {unitCount} unit{unitCount !== 1 ? 's' : ''} · {fmtDate(d.approvedAt ?? d.submittedAt)}
                    </div>

                    {d.status === 'APPROVED' && d.approvedBy && (
                      <div className="text-xs text-green-400 mt-1">
                        Approved by {d.approvedBy.name}
                        {d.invoices && d.invoices.length > 0 && (
                          <span className="text-zinc-500">
                            {' · '}Invoice{d.invoices.length > 1 ? 's' : ''}: {d.invoices.map((inv) => inv.invoiceNumber).join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                    {/* No invoice yet — offer to generate */}
                    {d.status === 'APPROVED' && d.invoices && d.invoices.length === 0 && canApprove && (
                      <div className="mt-1.5 space-y-1">
                        <div className="text-xs text-amber-400">No invoice generated — proforma may not be linked to this order.</div>
                        <button
                          type="button"
                          onClick={() => handleGenerateInvoice(d)}
                          disabled={genInvBusy[d.id]}
                          className="text-xs px-3 py-1 rounded-lg font-semibold disabled:opacity-40"
                          style={{ background: 'rgba(251,146,60,0.12)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' }}
                        >
                          {genInvBusy[d.id] ? 'Generating…' : '⚡ Generate Invoice'}
                        </button>
                        {genInvError[d.id] && <p className="text-xs text-rose-400">{genInvError[d.id]}</p>}
                      </div>
                    )}
                    {d.status === 'REJECTED' && d.rejectedReason && (
                      <div className="text-xs text-rose-400 mt-1">Rejected: {d.rejectedReason}</div>
                    )}

                    {/* Tracking number — APPROVED DOs only */}
                    {d.status === 'APPROVED' && (
                      <div className="mt-2">
                        {tracking && !isEditing ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-sky-400">🚚 {tracking}</span>
                            {canApprove && (
                              <button type="button"
                                onClick={() => {
                                  setTrackingInputs((p) => ({ ...p, [d.id]: tracking }));
                                  setTrackingEditing((p) => ({ ...p, [d.id]: true }));
                                }}
                                className="text-[10px] text-zinc-500 hover:text-zinc-300">
                                edit
                              </button>
                            )}
                          </div>
                        ) : canApprove ? (
                          <div className="space-y-1">
                            <div className="flex gap-2">
                              <input
                                type="text"
                                placeholder="Add tracking number…"
                                value={trackingInputs[d.id] ?? ''}
                                onChange={(e) => setTrackingInputs((p) => ({ ...p, [d.id]: e.target.value }))}
                                className="flex-1 text-xs px-2.5 py-1.5 rounded-lg font-mono text-white bg-transparent outline-none"
                                style={{ border: '1px solid rgba(255,255,255,0.15)' }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSetTracking(d); }}
                              />
                              <button
                                type="button"
                                onClick={() => handleSetTracking(d)}
                                disabled={trackingBusy[d.id] || !trackingInputs[d.id]?.trim()}
                                className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40"
                                style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.25)' }}
                              >
                                {trackingBusy[d.id] ? '…' : 'Save'}
                              </button>
                              {isEditing && (
                                <button type="button"
                                  onClick={() => setTrackingEditing((p) => ({ ...p, [d.id]: false }))}
                                  className="text-xs px-2 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-300">
                                  ✕
                                </button>
                              )}
                            </div>
                            {trackingError[d.id] && (
                              <p className="text-xs text-rose-400">{trackingError[d.id]}</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
