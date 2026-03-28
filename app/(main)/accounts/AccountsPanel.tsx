'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DOApprovals } from './DOApprovals';
import { DispatchApprovals } from './DispatchApprovals';

// ---- Types ----

type ProformaRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  currency: string;
  client: { id: string; code: string; customerName: string; globalOrIndian: string | null };
  createdBy: { id: string; name: string };
  _count: { items: number };
};

type DORow = {
  id: string;
  doNumber: string;
  status: string;
  totalBoxes: number | null;
  submittedAt: string | null;
  approvedAt:  string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    orderNumber: string;
    quantity: number;
    client: {
      customerName: string;
      shippingAddress: string | null;
      billingAddress: string | null;
      gstNumber: string | null;
      globalOrIndian: string | null;
      state: string | null;
    } | null;
    product: { code: string; name: string };
  };
  createdBy:  { name: string };
  approvedBy: { name: string } | null;
  boxes: Array<{
    id: string;
    boxNumber: number;
    boxLabel: string;
    photoUrl: string | null;
    isSealed: boolean;
    createdAt: string;
    items: Array<{
      id: string;
      serial: string;
      barcode: string;
      scannedAt: string;
      unit: { serialNumber: string; finalAssemblyBarcode: string | null };
    }>;
  }>;
};

type DispatchRow = {
  id: string;
  dispatchNumber: string;
  status: string;
  isPartial: boolean;
  partialReason: string | null;
  boxPhotoUrl: string | null;
  submittedAt: string | null;
  items: Array<{
    id: string;
    serial: string;
    barcode: string;
    controllerPhotoUrl: string | null;
    scannedAt: string;
    unit: { serialNumber: string; finalAssemblyBarcode: string | null };
    scannedBy: { name: string };
  }>;
  order: {
    orderNumber: string;
    quantity: number;
    client: {
      customerName: string;
      shippingAddress: string | null;
      billingAddress: string | null;
      gstNumber: string | null;
      globalOrIndian: string | null;
      state: string | null;
    } | null;
    product: { code: string; name: string };
  };
  dispatchedBy: { name: string };
};

// ---- Style maps ----

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  DRAFT:            { bg: 'rgba(113,113,122,0.1)', color: '#a1a1aa', border: 'rgba(113,113,122,0.2)' },
  PENDING_APPROVAL: { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  APPROVED:         { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80', border: 'rgba(34,197,94,0.2)'  },
  REJECTED:         { bg: 'rgba(239,68,68,0.1)',   color: '#f87171', border: 'rgba(239,68,68,0.2)'  },
  CONVERTED:        { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---- Main component ----

type PaymentRequestRow = {
  id: string;
  requestNumber: string;
  status: string;
  aiVerified: boolean;
  aiVerificationNote?: string | null;
  accountsNote?: string | null;
  adminNote?: string | null;
  requestedAt: string;
  notes?: string | null;
  po: {
    poNumber: string;
    totalAmount: number;
    currency: string;
    paidAmount: number;
    paymentStatus: string;
    vendor: { name: string };
    rfq?: { rfqNumber: string; paymentTerms?: string | null } | null;
  };
  vendorInvoice: {
    invoiceNumber: string;
    amount: number;
    gstAmount: number;
    tdsAmount: number;
    netAmount: number;
    fileUrl?: string | null;
  };
  requestedBy: { name: string };
  accountsBy?: { name: string } | null;
  adminApprovedBy?: { name: string } | null;
};

export function AccountsPanel({
  proformas,
  dispatches,
  doDispatches,
}: {
  proformas: ProformaRow[];
  invoices?: unknown[];
  returns?: unknown[];
  dispatches: DispatchRow[];
  doDispatches: DORow[];
}) {
  const [approvalSub, setApprovalSub] = useState<'pending' | 'completed'>('pending');

  // ── Pending ──────────────────────────────────────────────────────────────
  const pendingProformas  = proformas.filter((p) => p.status === 'PENDING_APPROVAL');
  const pendingDispatches = dispatches.length;
  const submittedDOs      = doDispatches.filter((d) => d.status === 'SUBMITTED');

  // ── Complete / History ────────────────────────────────────────────────────
  const historyDOs         = doDispatches.filter((d) => d.status !== 'SUBMITTED');
  const completedProformas = proformas.filter((p) =>
    ['APPROVED', 'CONVERTED', 'REJECTED'].includes(p.status)
  );

  const totalPending = pendingProformas.length + submittedDOs.length + pendingDispatches;

  return (
    <div className="space-y-4">

      {/* ── Sub-tabs: Pending | Completed ──────────────────────────────── */}
      <div className="flex gap-1 bg-zinc-900/60 rounded-xl p-1">
        <button onClick={() => setApprovalSub('pending')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
            approvalSub === 'pending' ? 'bg-amber-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}>
          Pending
          {totalPending > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              approvalSub === 'pending' ? 'bg-white/20 text-white' : 'bg-amber-500/15 text-amber-400'
            }`}>{totalPending}</span>
          )}
        </button>
        <button onClick={() => setApprovalSub('completed')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
            approvalSub === 'completed' ? 'bg-zinc-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
          }`}>
          Completed
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            approvalSub === 'completed' ? 'bg-white/20 text-white' : 'bg-zinc-500/15 text-zinc-500'
          }`}>{historyDOs.length + completedProformas.length}</span>
        </button>
      </div>

      {/* ── PENDING tab ────────────────────────────────────────────────── */}
      {approvalSub === 'pending' && (
        <div className="space-y-3">
          {totalPending === 0 && (
            <div className="card p-6 text-center">
              <p className="text-zinc-500 text-sm">No pending approvals.</p>
            </div>
          )}

          {/* Submitted Dispatch Orders */}
          {submittedDOs.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide mb-2">
                Dispatch Orders ({submittedDOs.length})
              </p>
              <DOApprovals dispatches={submittedDOs as any} />
            </div>
          )}

          {/* Legacy dispatch approvals */}
          {pendingDispatches > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-sky-400 uppercase tracking-wide mb-2">
                Dispatches ({pendingDispatches})
              </p>
              <DispatchApprovals dispatches={dispatches as any} />
            </div>
          )}

          {/* Proforma approvals */}
          {pendingProformas.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide mb-2">
                Proforma Invoices ({pendingProformas.length})
              </p>

              <div className="space-y-2">
                {pendingProformas.map((p) => (
                  <div key={p.id} className="card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-semibold text-sm">{p.invoiceNumber}</span>
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                            style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.3)' }}
                          >
                            Pending Approval
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{p.currency}</span>
                        </div>
                        <p className="text-zinc-400 text-sm mt-0.5">{p.client.customerName}</p>
                        <p className="text-zinc-600 text-xs mt-0.5">
                          {fmtDate(p.invoiceDate)}
                          {' · '}{p._count.items} item{p._count.items !== 1 ? 's' : ''}
                          {' · '}by {p.createdBy.name}
                        </p>
                      </div>
                      <Link
                        href={`/sales/${p.id}`}
                        className="shrink-0 text-xs font-semibold px-3 py-2 rounded-lg transition-colors"
                        style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.25)', color: '#38bdf8' }}
                      >
                        Review
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── COMPLETED tab ──────────────────────────────────────────────── */}
      {approvalSub === 'completed' && (
        <div className="space-y-4">
          {historyDOs.length === 0 && completedProformas.length === 0 && (
            <div className="card p-6 text-center">
              <p className="text-zinc-500 text-sm">No completed approvals yet.</p>
            </div>
          )}

          {/* Approved / Rejected DOs */}
          {historyDOs.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                Dispatch Orders ({historyDOs.length})
              </p>
              <div className="space-y-2">
                {historyDOs.map((d) => {
                  const allUnits  = d.boxes.flatMap((b) => b.items).length;
                  const isApproved = d.status === 'APPROVED';
                  return (
                    <div key={d.id} className="card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-semibold text-sm">{d.doNumber}</span>
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={
                                isApproved
                                  ? { background: 'rgba(34,197,94,0.1)',  color: '#4ade80' }
                                  : { background: 'rgba(239,68,68,0.1)',  color: '#f87171' }
                              }
                            >
                              {isApproved ? 'Approved' : 'Rejected'}
                            </span>
                          </div>
                          <p className="text-zinc-400 text-sm mt-0.5">
                            {d.order.client?.customerName ?? '—'} · Order #{d.order.orderNumber}
                          </p>
                          <p className="text-zinc-500 text-xs mt-0.5">
                            {d.order.product.name} · {allUnits} unit{allUnits !== 1 ? 's' : ''} · {d.boxes.length} box{d.boxes.length !== 1 ? 'es' : ''}
                          </p>
                          <p className="text-zinc-600 text-xs mt-0.5">
                            {isApproved
                              ? `Approved ${fmtDate(d.approvedAt)}${d.approvedBy ? ` by ${d.approvedBy.name}` : ''}`
                              : `Rejected ${fmtDate(d.approvedAt ?? d.updatedAt)}`}
                          </p>
                        </div>
                        <a
                          href={`/print/dispatch-order/${d.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View DO"
                          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-sky-400 transition-colors"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V8m0 8l-3-3m3 3l3-3M4 20h16" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Approved / Converted / Rejected proformas */}
          {completedProformas.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                Proforma Invoices ({completedProformas.length})
              </p>
              <div className="space-y-2">
                {completedProformas.map((p) => {
                  const st = STATUS_STYLE[p.status] ?? STATUS_STYLE.APPROVED;
                  return (
                    <div key={p.id} className="card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/sales/${p.id}`} className="flex-1 min-w-0 block">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-semibold text-sm">{p.invoiceNumber}</span>
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded border"
                              style={{ background: st.bg, color: st.color, borderColor: st.border }}
                            >
                              {p.status.replace('_', ' ')}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{p.currency}</span>
                          </div>
                          <p className="text-zinc-400 text-sm mt-0.5">{p.client.customerName}</p>
                          <p className="text-zinc-600 text-xs mt-0.5">
                            {fmtDate(p.invoiceDate)}
                            {' · '}{p._count.items} item{p._count.items !== 1 ? 's' : ''}
                          </p>
                        </Link>
                        <Link
                          href={`/sales/${p.id}`}
                          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-zinc-500 hover:text-sky-400 transition-colors"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   AP / PAYABLES TAB
════════════════════════════════════════════════════════*/
function APPayablesTab({ onRouterRefresh }: { onRouterRefresh: () => void }) {
  const [requests, setRequests] = useState<PaymentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteModal, setNoteModal] = useState<{ id: string; action: 'request-approval' | 'process-payment' } | null>(null);

  const PAYMENT_STATUS_COLOR: Record<string, string> = {
    SUBMITTED: 'bg-zinc-800 text-zinc-400',
    UNDER_REVIEW: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/50',
    PENDING_APPROVAL: 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
    APPROVED: 'bg-blue-900/40 text-blue-300 border border-blue-700/50',
    PROCESSING: 'bg-cyan-900/40 text-cyan-300 border border-cyan-700/50',
    PAID: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
    REJECTED: 'bg-red-900/40 text-red-300 border border-red-700/50',
  };

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/procurement/payment-requests');
    if (r.ok) setRequests(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center text-zinc-500 py-12 text-sm">Loading...</div>;

  const underReview = requests.filter(r => r.status === 'UNDER_REVIEW');
  const approved = requests.filter(r => r.status === 'APPROVED');
  const others = requests.filter(r => !['UNDER_REVIEW', 'APPROVED'].includes(r.status));

  function renderPR(pr: PaymentRequestRow) {
    return (
      <div key={pr.id} className="card p-4 space-y-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-semibold text-sm text-white">{pr.requestNumber}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${PAYMENT_STATUS_COLOR[pr.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                {pr.status.replace(/_/g, ' ')}
              </span>
              {pr.aiVerified ? (
                <span className="text-[10px] text-emerald-400 bg-emerald-900/30 px-1.5 py-0.5 rounded border border-emerald-700/40">AI OK</span>
              ) : (
                <span className="text-[10px] text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded border border-amber-700/40">Review</span>
              )}
            </div>
            <p className="text-zinc-400 text-sm mt-0.5">
              {pr.po.vendor.name} · {pr.po.poNumber}
            </p>
            <p className="text-zinc-500 text-xs mt-0.5">
              Invoice: {pr.vendorInvoice.invoiceNumber} · Net: ₹{pr.vendorInvoice.netAmount.toLocaleString('en-IN')}
              {pr.po.rfq?.paymentTerms && <> · <span className="text-zinc-300">{pr.po.rfq.paymentTerms}</span></>}
            </p>
            {pr.aiVerificationNote && (
              <p className="text-zinc-600 text-xs mt-0.5 italic">{pr.aiVerificationNote}</p>
            )}
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {pr.vendorInvoice.fileUrl && (
              <a href={pr.vendorInvoice.fileUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300">Invoice PDF</a>
            )}
            {pr.status === 'UNDER_REVIEW' && (
              <button onClick={() => setNoteModal({ id: pr.id, action: 'request-approval' })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-700 hover:bg-amber-600 text-white">
                Request Admin Approval
              </button>
            )}
            {pr.status === 'APPROVED' && (
              <button onClick={() => setNoteModal({ id: pr.id, action: 'process-payment' })}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white">
                Process Payment
              </button>
            )}
          </div>
        </div>
        {pr.accountsNote && (
          <p className="text-xs text-zinc-500 border-t border-zinc-800 pt-2">Accounts: {pr.accountsNote}</p>
        )}
        {pr.adminNote && (
          <p className="text-xs text-emerald-400 border-t border-zinc-800 pt-2">Admin: {pr.adminNote}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.length === 0 && (
        <div className="card p-6 text-center">
          <p className="text-zinc-500 text-sm">No payment requests assigned to Accounts yet.</p>
        </div>
      )}

      {underReview.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-yellow-400 uppercase tracking-wide mb-2">
            Under Review ({underReview.length})
          </p>
          <div className="space-y-2">{underReview.map(renderPR)}</div>
        </div>
      )}

      {approved.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-2">
            Approved — Ready to Pay ({approved.length})
          </p>
          <div className="space-y-2">{approved.map(renderPR)}</div>
        </div>
      )}

      {others.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-2">
            All Other ({others.length})
          </p>
          <div className="space-y-2">{others.map(renderPR)}</div>
        </div>
      )}

      {noteModal && (
        <APActionModal
          id={noteModal.id}
          action={noteModal.action}
          onClose={() => setNoteModal(null)}
          onDone={() => { setNoteModal(null); load(); onRouterRefresh(); }}
        />
      )}
    </div>
  );
}

function APActionModal({ id, action, onClose, onDone }: {
  id: string;
  action: 'request-approval' | 'process-payment';
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('NEFT');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    let r: Response;
    if (action === 'request-approval') {
      r = await fetch(`/api/procurement/payment-requests/${id}/request-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountsNote: note }),
      });
    } else {
      if (!paymentAmount || !paymentDate) { setSaving(false); return alert('Fill payment amount and date'); }
      r = await fetch(`/api/procurement/payment-requests/${id}/process-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentAmount: parseFloat(paymentAmount), paymentMode, paymentRef: paymentRef || undefined, paymentDate }),
      });
    }
    setSaving(false);
    if (r.ok) onDone();
    else { const e = await r.json(); alert(e.error); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm">
        <div className="p-6">
          <h2 className="text-white font-semibold text-lg mb-4">
            {action === 'request-approval' ? 'Request Admin Approval' : 'Process Payment'}
          </h2>
          <div className="space-y-3">
            {action === 'request-approval' ? (
              <div>
                <label className="text-zinc-400 text-sm">Note to Admin (optional)</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
              </div>
            ) : (
              <>
                <div>
                  <label className="text-zinc-400 text-sm">Payment Amount (₹) *</label>
                  <input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} min={0}
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-zinc-400 text-sm">Payment Mode *</label>
                  <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="UPI">UPI</option>
                  </select>
                </div>
                <div>
                  <label className="text-zinc-400 text-sm">Payment Reference</label>
                  <input value={paymentRef} onChange={e => setPaymentRef(e.target.value)} placeholder="UTR / Cheque no."
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-zinc-400 text-sm">Payment Date *</label>
                  <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </>
            )}
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
