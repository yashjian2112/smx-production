'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────
type DOListItem = {
  id:          string;
  doNumber:    string;
  status:      string;
  totalBoxes:  number | null;
  createdAt:   string;
  submittedAt: string | null;
  approvedAt:  string | null;
  rejectedAt:  string | null;
  rejectedReason: string | null;
  order: {
    orderNumber: string;
    quantity:    number;
    client:      { customerName: string } | null;
    product:     { code: string; name: string };
  };
  createdBy:  { name: string };
  approvedBy: { name: string } | null;
  boxes: { _count: { items: number } }[];
  invoices?: { invoiceNumber: string }[];
};

type Tab = 'processing' | 'completed';

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
    <span
      className="text-[11px] font-bold px-2 py-0.5 rounded"
      style={{ color: c.color, background: c.bg }}
    >
      {c.label}
    </span>
  );
}

// ─── Main ShippingPanel ────────────────────────────────────────────────────────
export function ShippingPanel({
  sessionRole,
  sessionName,
}: {
  sessionRole:   string;
  sessionName:   string;
  initialDrafts?: unknown[];
}) {
  const router = useRouter();

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('processing');

  // DO lists
  const [processingDOs, setProcessingDOs] = useState<DOListItem[] | null>(null);
  const [completedDOs,  setCompletedDOs]  = useState<DOListItem[] | null>(null);
  const [loadingDOs, setLoadingDOs]       = useState(false);

  // Load DOs by status group
  async function loadDOs(tab: Tab) {
    setLoadingDOs(true);
    try {
      let url = '';
      const isPackingRole = sessionRole === 'PACKING';
      if (tab === 'processing') url = isPackingRole
        ? '/api/dispatch-orders?status=OPEN,PACKING'
        : '/api/dispatch-orders?status=SUBMITTED';
      if (tab === 'completed')  url = '/api/dispatch-orders?status=APPROVED,REJECTED';
      if (!url) return;
      const res  = await fetch(url);
      const data = await res.json() as DOListItem[];
      if (tab === 'processing') setProcessingDOs(Array.isArray(data) ? data : []);
      if (tab === 'completed')  setCompletedDOs(Array.isArray(data) ? data : []);
    } finally {
      setLoadingDOs(false);
    }
  }

  // Tab change handler
  function handleTabChange(tab: Tab) {
    setActiveTab(tab);
    if (tab === 'processing' && processingDOs === null) loadDOs('processing');
    if (tab === 'completed'  && completedDOs  === null) loadDOs('completed');
  }

  // Load processing DOs on mount
  useEffect(() => {
    loadDOs('processing');
  }, []);

  const isPackingRole = sessionRole === 'PACKING';

  const tabs: { key: Tab; label: string }[] = [
    { key: 'processing', label: isPackingRole ? 'To Pack' : 'Processing' },
    { key: 'completed',  label: 'Completed' },
  ];

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Shipping</h2>
          <p className="text-sm text-zinc-400 mt-0.5">Review and manage dispatch orders</p>
        </div>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}
        >
          {sessionName}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
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

      {/* ── PROCESSING TAB (SUBMITTED DOs awaiting approval) ── */}
      {activeTab === 'processing' && (
        <div className="space-y-3">
          {loadingDOs && <div className="text-zinc-500 text-sm">Loading…</div>}

          {!loadingDOs && processingDOs !== null && processingDOs.length === 0 && (
            <div className="text-sm text-zinc-500 text-center py-6">
              {isPackingRole ? 'No dispatch orders to pack.' : 'No dispatch orders pending approval.'}
            </div>
          )}

          {!loadingDOs && (processingDOs ?? []).map((d) => {
            const unitCount  = d.boxes.reduce((sum: number, b) => sum + (b._count?.items ?? 0), 0);
            const boxCount   = d.totalBoxes ?? d.boxes.length;
            const dateRef    = isPackingRole ? d.createdAt : d.submittedAt;
            const dateLabel  = isPackingRole ? 'Created' : 'Submitted';
            const dateStr    = dateRef
              ? new Date(dateRef).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—';
            return (
              <div key={d.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm text-white">{d.doNumber}</span>
                      <DOStatusBadge status={d.status} />
                    </div>
                    <div className="text-sm text-zinc-400 mt-0.5">
                      {d.order.client?.customerName ?? '—'} · #{d.order.orderNumber}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {d.order.product.name} · {boxCount > 0 ? `${boxCount} box${boxCount !== 1 ? 'es' : ''} · ` : ''}{unitCount > 0 ? `${unitCount} unit${unitCount !== 1 ? 's' : ''} · ` : ''}{dateLabel} {dateStr}
                    </div>
                    <div className="text-xs text-zinc-600 mt-0.5">by {d.createdBy.name}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/shipping/do/${d.id}`)}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                    style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}
                  >
                    {isPackingRole ? 'Pack' : 'View'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── COMPLETED TAB (APPROVED + REJECTED DOs) ── */}
      {activeTab === 'completed' && (
        <div className="space-y-3">
          {loadingDOs && <div className="text-zinc-500 text-sm">Loading…</div>}

          {!loadingDOs && completedDOs !== null && completedDOs.length === 0 && (
            <div className="text-sm text-zinc-500 text-center py-6">No dispatch history yet.</div>
          )}

          {!loadingDOs && (completedDOs ?? []).map((d) => {
            const unitCount = d.boxes.reduce((sum: number, b) => sum + (b._count?.items ?? 0), 0);
            const boxCount  = d.totalBoxes ?? d.boxes.length;
            const dateStr   = d.approvedAt
              ? new Date(d.approvedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              : d.submittedAt
              ? new Date(d.submittedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—';
            return (
              <div key={d.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm text-white">{d.doNumber}</span>
                      <DOStatusBadge status={d.status} />
                    </div>
                    <div className="text-sm text-zinc-400 mt-0.5">
                      {d.order.client?.customerName ?? '—'} · #{d.order.orderNumber}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {d.order.product.name} · {boxCount} box{boxCount !== 1 ? 'es' : ''} · {unitCount} unit{unitCount !== 1 ? 's' : ''} · {dateStr}
                    </div>
                    {d.status === 'APPROVED' && d.approvedBy && (
                      <div className="text-xs text-green-400 mt-1">
                        Approved by {d.approvedBy.name}
                        {d.invoices && d.invoices.length > 0 && (
                          <span className="text-zinc-500"> · Invoice{d.invoices.length > 1 ? 's' : ''}: {d.invoices.map((inv) => inv.invoiceNumber).join(', ')}</span>
                        )}
                      </div>
                    )}
                    {d.status === 'REJECTED' && d.rejectedReason && (
                      <div className="text-xs text-rose-400 mt-1">Rejected: {d.rejectedReason}</div>
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
