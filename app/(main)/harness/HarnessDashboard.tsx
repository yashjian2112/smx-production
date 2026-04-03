'use client';

import { useState, useEffect, useCallback } from 'react';
import { Cable, Package, CheckCircle2, XCircle, Clock, Play, Zap, RefreshCw, ChevronDown, ChevronUp, Printer, ScanLine, Hash, User, Calendar, Check } from 'lucide-react';
import { ScanInput } from '@/components/ScanInput';

type HarnessUnit = {
  id: string;
  serialNumber: string | null;
  barcode: string | null;
  orderId: string;
  productId: string;
  assignedUserId: string | null;
  status: string;
  harnessModel: string | null;
  qcData: Record<string, { status: string; remarks?: string; name?: string }> | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  order: { id: string; orderNumber: string; clientId: string; quantity: number };
  product: { id: string; code: string; name: string };
  assignedUser: { id: string; name: string } | null;
  pairedController: { id: string; serialNumber: string } | null;
};


type Connector = {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

type Tab = 'pending' | 'in_progress' | 'qc' | 'completed';

const STATUS_MAP: Record<Tab, string[]> = {
  pending:     ['PENDING'],
  in_progress: ['ACCEPTED', 'CRIMPING'],
  qc:          ['QC_PENDING'],
  completed:   ['QC_PASSED', 'READY'],
};

export default function HarnessDashboard({ role, userId }: { role: string; userId: string }) {
  const [tab, setTab] = useState<Tab>('pending');
  const [units, setUnits] = useState<HarnessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  // QC panel state
  const [qcUnitId, setQcUnitId] = useState<string | null>(null);
  const [qcScanVerified, setQcScanVerified] = useState(false);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [qcResults, setQcResults] = useState<Record<string, { status: 'PASS' | 'FAIL'; remarks: string }>>({});
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  // Job card expanded
  const [jobCardUnit, setJobCardUnit] = useState<string | null>(null);
  // Order-level accept
  const [acceptingOrder, setAcceptingOrder] = useState<string | null>(null);

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = STATUS_MAP[tab].join(',');
      const res = await fetch(`/api/harness?status=${statuses}`);
      if (res.ok) {
        let data: HarnessUnit[] = await res.json();
        // For completed tab, only show last 14 days
        if (tab === 'completed') {
          const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
          data = data.filter(u => new Date(u.updatedAt).getTime() >= cutoff);
        }
        setUnits(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // ── Per-unit Actions ──
  async function doAction(unitId: string, action: string, extra?: Record<string, unknown>) {
    setActing(unitId);
    try {
      const res = await fetch(`/api/harness/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Action failed');
        return;
      }
      if (action === 'start_crimping') {
        window.open(`/print/harness/${unitId}`, '_blank');
      }
      fetchUnits();
    } catch (e) {
      console.error(e);
    } finally {
      setActing(null);
    }
  }

  // ── Accept entire order ──
  async function acceptOrder(orderId: string) {
    setAcceptingOrder(orderId);
    try {
      const res = await fetch('/api/harness/accept-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to accept order');
        return;
      }
      fetchUnits();
    } catch (e) {
      console.error(e);
    } finally {
      setAcceptingOrder(null);
    }
  }

  // ── Load connectors for QC ──
  async function openQC(unit: HarnessUnit) {
    setQcUnitId(unit.id);
    setQcScanVerified(false);
    setQcResults({});
    try {
      const res = await fetch(`/api/admin/harness-connectors?productId=${unit.productId}`);
      if (res.ok) {
        const data = await res.json();
        setConnectors(data);
        const existing = unit.qcData ?? {};
        const initial: typeof qcResults = {};
        for (const c of data) {
          const prev = existing[c.id];
          initial[c.id] = {
            status: (prev?.status as 'PASS' | 'FAIL') || ('PASS' as const),
            remarks: prev?.remarks || '',
          };
        }
        setQcResults(initial);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function handleQcScan(unit: HarnessUnit, scannedValue: string) {
    const val = scannedValue.trim().toUpperCase();
    const barcodeMatch = unit.barcode && val === unit.barcode.toUpperCase();
    const serialMatch = unit.serialNumber && val === unit.serialNumber.toUpperCase();
    if (barcodeMatch || serialMatch) {
      setQcScanVerified(true);
    } else {
      alert('Barcode does not match this harness unit. Please scan the correct barcode.');
    }
  }

  function submitQC(unit: HarnessUnit) {
    const allPass = Object.values(qcResults).every(r => r.status === 'PASS');
    const action = allPass ? 'qc_pass' : 'qc_fail';
    const failedNames = connectors
      .filter(c => qcResults[c.id]?.status === 'FAIL')
      .map(c => c.name);
    const remarks = allPass ? 'All connectors passed' : `Failed: ${failedNames.join(', ')}`;

    const qcDataWithNames: Record<string, { status: string; remarks: string; name: string }> = {};
    for (const c of connectors) {
      const result = qcResults[c.id];
      if (result) {
        qcDataWithNames[c.id] = { status: result.status, remarks: result.remarks, name: c.name };
      }
    }

    doAction(unit.id, action, { qcData: qcDataWithNames, remarks });
    setQcUnitId(null);
    setQcScanVerified(false);
  }

  // ── Group by order ──
  const orderGroups: Record<string, HarnessUnit[]> = {};
  for (const u of units) {
    const key = u.order.orderNumber;
    if (!orderGroups[key]) orderGroups[key] = [];
    orderGroups[key].push(u);
  }
  const orderKeys = Object.keys(orderGroups).sort();

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'pending',     label: 'Pending',     icon: <Clock className="w-4 h-4" /> },
    { key: 'in_progress', label: 'In Progress', icon: <Play className="w-4 h-4" /> },
    { key: 'qc',          label: 'QC',          icon: <Zap className="w-4 h-4" /> },
    { key: 'completed',   label: 'Completed',   icon: <Check className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cable className="w-5 h-5 text-sky-400" />
          <h2 className="text-lg font-semibold">Harness Production</h2>
        </div>
        <button onClick={fetchUnits} className="text-slate-400 hover:text-white p-1" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-smx-surface rounded-lg p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors ${
              tab === t.key
                ? 'bg-sky-600/20 text-sky-400 border border-sky-600/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm">Loading...</div>
      ) : units.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-sm">
          {tab === 'completed' ? 'No completed harness units in the last 14 days' : 'No harness units in this category'}
        </div>
      ) : (
        <div className="space-y-3">
          {orderKeys.map(orderNum => {
            const group = orderGroups[orderNum];
            const isExpanded = expandedOrder === orderNum || orderKeys.length === 1;
            const isPendingTab = tab === 'pending';
            const isCompletedTab = tab === 'completed';
            const orderId = group[0].orderId;

            return (
              <div key={orderNum} className="rounded-xl bg-smx-surface border border-slate-700 overflow-hidden">
                {/* Order header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => setExpandedOrder(isExpanded ? null : orderNum)}
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                  >
                    <Package className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-medium text-sm">{orderNum}</span>
                    <span className="text-slate-500 text-xs">{group[0].product.code}</span>
                    <span className="text-slate-600 text-[10px]">Qty: {group[0].order.quantity}</span>
                    <span className="bg-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded text-[10px]">{group.length} harness</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </button>
                  {/* Order-level Accept button (only on pending tab) */}
                  {isPendingTab && (
                    <button
                      onClick={() => acceptOrder(orderId)}
                      disabled={acceptingOrder === orderId}
                      className="ml-2 px-4 py-2 rounded-lg border text-sm font-medium bg-sky-600/20 text-sky-400 border-sky-600/40 hover:bg-sky-600/30 shrink-0 disabled:opacity-40"
                    >
                      {acceptingOrder === orderId ? '...' : 'Accept Order'}
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-700 divide-y divide-slate-700/50">
                    {group.map((unit, idx) => (
                      <div key={unit.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {unit.barcode ? (
                                <span className="font-mono text-sm text-sky-300">{unit.barcode}</span>
                              ) : (
                                <span className="text-sm text-slate-500">Harness #{idx + 1}</span>
                              )}
                              <span className={badgeCls(unit.status)}>{unit.status.replace(/_/g, ' ')}</span>
                            </div>
                            {unit.serialNumber && (
                              <p className="text-[10px] text-slate-500 mt-0.5">SN: {unit.serialNumber}</p>
                            )}
                            {unit.harnessModel && (
                              <p className="text-[10px] text-sky-400/70 mt-0.5">Model: {unit.harnessModel}</p>
                            )}
                            {unit.assignedUser && (
                              <p className="text-[10px] text-slate-500">Assigned: {unit.assignedUser.name}</p>
                            )}
                            {unit.remarks && (
                              <p className="text-[10px] text-amber-400 mt-0.5">{unit.remarks}</p>
                            )}
                          </div>
                          <div className="flex gap-2 items-center shrink-0">
                            {/* Job card toggle */}
                            <button
                              onClick={() => setJobCardUnit(jobCardUnit === unit.id ? null : unit.id)}
                              className={`p-1.5 rounded-lg hover:bg-slate-700/50 ${jobCardUnit === unit.id ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'}`}
                              title="Job card"
                            >
                              <Hash className="w-4 h-4" />
                            </button>
                            {/* Print barcode button */}
                            {unit.barcode && (unit.status === 'CRIMPING' || unit.status === 'QC_PENDING' || unit.status === 'QC_PASSED' || unit.status === 'READY') && (
                              <button
                                onClick={() => window.open(`/print/harness/${unit.id}`, '_blank')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50"
                                title="Print barcode label"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            )}
                            {/* Action buttons based on status (no Accept — that's order-level now) */}
                            {unit.status === 'ACCEPTED' && (
                              <ActionBtn label="Start Crimping" color="amber" loading={acting === unit.id} onClick={() => doAction(unit.id, 'start_crimping')} />
                            )}
                            {unit.status === 'CRIMPING' && (
                              <ActionBtn label="Crimping Done" color="emerald" loading={acting === unit.id} onClick={() => doAction(unit.id, 'crimping_done')} />
                            )}
                            {unit.status === 'QC_PENDING' && (
                              <ActionBtn label="Start QC" color="purple" loading={acting === unit.id} onClick={() => openQC(unit)} />
                            )}
                          </div>
                        </div>

                        {/* Job card */}
                        {jobCardUnit === unit.id && (
                          <JobCard unit={unit} index={idx} />
                        )}

                        {/* QC Panel (inline) */}
                        {qcUnitId === unit.id && (
                          !qcScanVerified ? (
                            <QCScanStep
                              unit={unit}
                              onVerified={(val) => handleQcScan(unit, val)}
                              onCancel={() => { setQcUnitId(null); setQcScanVerified(false); }}
                            />
                          ) : (
                            <QCPanel
                              connectors={connectors}
                              qcResults={qcResults}
                              setQcResults={setQcResults}
                              onSubmit={() => submitQC(unit)}
                              onCancel={() => { setQcUnitId(null); setQcScanVerified(false); }}
                              submitting={acting === unit.id}
                            />
                          )
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Badge classes ──
function badgeCls(status: string) {
  const map: Record<string, string> = {
    PENDING:    'bg-slate-600/30 text-slate-400',
    ACCEPTED:   'bg-blue-600/20 text-blue-400',
    CRIMPING:   'bg-amber-600/20 text-amber-400',
    QC_PENDING: 'bg-purple-600/20 text-purple-400',
    QC_PASSED:  'bg-emerald-600/20 text-emerald-400',
    QC_FAILED:  'bg-red-600/20 text-red-400',
    READY:      'bg-green-600/20 text-green-400',
    DISPATCHED: 'bg-sky-600/20 text-sky-400',
  };
  return `px-2 py-0.5 rounded text-[10px] font-medium ${map[status] || 'bg-slate-600/30 text-slate-400'}`;
}

// ── Action Button ──
function ActionBtn({ label, color, loading, onClick }: { label: string; color: string; loading: boolean; onClick: () => void }) {
  const colorMap: Record<string, string> = {
    sky:     'bg-sky-600/20 text-sky-400 border-sky-600/40 hover:bg-sky-600/30',
    amber:   'bg-amber-600/20 text-amber-400 border-amber-600/40 hover:bg-amber-600/30',
    emerald: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/40 hover:bg-emerald-600/30',
    purple:  'bg-purple-600/20 text-purple-400 border-purple-600/40 hover:bg-purple-600/30',
    red:     'bg-red-600/20 text-red-400 border-red-600/40 hover:bg-red-600/30',
    orange:  'bg-orange-600/20 text-orange-400 border-orange-600/40 hover:bg-orange-600/30',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 ${colorMap[color] || colorMap.sky}`}
    >
      {loading ? '...' : label}
    </button>
  );
}

// ── Job Card ──
function JobCard({ unit, index }: { unit: HarnessUnit; index: number }) {
  const createdDate = new Date(unit.createdAt);
  const updatedDate = new Date(unit.updatedAt);

  const statusFlow = ['PENDING', 'ACCEPTED', 'CRIMPING', 'QC_PENDING', 'QC_PASSED', 'READY'];
  const currentIdx = statusFlow.indexOf(unit.status === 'QC_FAILED' ? 'QC_PENDING' : unit.status);

  return (
    <div className="mt-3 p-4 rounded-lg bg-smx-bg border border-slate-600/50 space-y-4">
      <div className="flex items-center gap-2">
        <Cable className="w-4 h-4 text-sky-400" />
        <span className="text-sm font-semibold text-sky-300">Job Card</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Product</p>
          <p className="text-slate-200 font-medium">{unit.product.code}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Order</p>
          <p className="text-slate-200">{unit.order.orderNumber}</p>
        </div>
        {unit.harnessModel && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Model</p>
            <p className="text-sky-300 font-medium">{unit.harnessModel}</p>
          </div>
        )}
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Order Qty</p>
          <p className="text-slate-200">{unit.order.quantity} units</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Harness #</p>
          <p className="text-slate-200">{index + 1} of {unit.order.quantity}</p>
        </div>
        {unit.barcode && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Barcode</p>
            <p className="font-mono text-sky-300">{unit.barcode}</p>
          </div>
        )}
        {unit.serialNumber && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Serial Number</p>
            <p className="font-mono text-slate-200">{unit.serialNumber}</p>
          </div>
        )}
        <div className="flex items-start gap-1.5">
          <User className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Assigned To</p>
            <p className="text-slate-200">{unit.assignedUser?.name || 'Unassigned'}</p>
          </div>
        </div>
        <div className="flex items-start gap-1.5">
          <Calendar className="w-3 h-3 text-slate-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Created</p>
            <p className="text-slate-200">{createdDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>
      </div>

      {/* Status Progress */}
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Progress</p>
        <div className="flex items-center gap-0.5">
          {statusFlow.map((s, i) => {
            const isDone = i <= currentIdx;
            const isCurrent = s === unit.status || (unit.status === 'QC_FAILED' && s === 'QC_PENDING');
            const isFailed = unit.status === 'QC_FAILED' && s === 'QC_PENDING';
            return (
              <div key={s} className="flex-1 flex flex-col items-center gap-1">
                <div className={`w-full h-1.5 rounded-full ${isFailed ? 'bg-red-500' : isDone ? 'bg-sky-500' : 'bg-slate-700'}`} />
                <span className={`text-[8px] leading-tight text-center ${
                  isCurrent ? (isFailed ? 'text-red-400 font-medium' : 'text-sky-400 font-medium') :
                  isDone ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  {s.replace(/_/g, ' ')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {unit.remarks && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Remarks</p>
          <p className="text-xs text-amber-400">{unit.remarks}</p>
        </div>
      )}

      <div className="text-[10px] text-slate-600 pt-2 border-t border-slate-700/50">
        Last updated: {updatedDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}

// ── QC Scan Verification Step ──
function QCScanStep({
  unit,
  onVerified,
  onCancel,
}: {
  unit: HarnessUnit;
  onVerified: (val: string) => void;
  onCancel: () => void;
}) {
  const [scanVal, setScanVal] = useState('');
  const [error, setError] = useState('');

  function handleScan(val: string) {
    const v = val.trim().toUpperCase();
    const barcodeMatch = unit.barcode && v === unit.barcode.toUpperCase();
    const serialMatch = unit.serialNumber && v === unit.serialNumber.toUpperCase();
    if (barcodeMatch || serialMatch) {
      onVerified(v);
    } else {
      setError('Barcode does not match this harness unit');
      setScanVal('');
    }
  }

  return (
    <div className="mt-3 p-3 rounded-lg bg-smx-bg border border-purple-600/30 space-y-3">
      <div className="flex items-center gap-2">
        <ScanLine className="w-4 h-4 text-purple-400" />
        <p className="text-xs font-medium text-purple-400">Scan Harness Barcode to Start QC</p>
      </div>
      <p className="text-[10px] text-slate-500">
        Scan the barcode label on harness <span className="text-sky-300 font-mono">{unit.barcode || 'N/A'}</span> to verify identity before QC testing.
      </p>
      <ScanInput
        value={scanVal}
        onChange={setScanVal}
        onScan={handleScan}
        placeholder="Scan barcode..."
        autoFocus
        scannerTitle="Scan Harness"
        scannerHint="Point at the harness barcode label"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs hover:bg-slate-600">Cancel</button>
      </div>
    </div>
  );
}

// ── QC Panel ──
function QCPanel({
  connectors,
  qcResults,
  setQcResults,
  onSubmit,
  onCancel,
  submitting,
}: {
  connectors: Connector[];
  qcResults: Record<string, { status: 'PASS' | 'FAIL'; remarks: string }>;
  setQcResults: React.Dispatch<React.SetStateAction<Record<string, { status: 'PASS' | 'FAIL'; remarks: string }>>>;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  if (connectors.length === 0) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-smx-bg border border-amber-600/40 text-amber-400 text-xs">
        No connectors configured for this product. Configure them in Admin &rarr; Harness Connectors.
      </div>
    );
  }

  const allPass = Object.values(qcResults).every(r => r.status === 'PASS');
  const failCount = Object.values(qcResults).filter(r => r.status === 'FAIL').length;

  return (
    <div className="mt-3 p-3 rounded-lg bg-smx-bg border border-purple-600/30 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-purple-400" />
        <p className="text-xs font-medium text-purple-400">Connector QC Test</p>
        <span className="text-[9px] text-emerald-400 bg-emerald-600/10 px-1.5 py-0.5 rounded">Barcode Verified</span>
      </div>
      <div className="space-y-2">
        {connectors.map(c => {
          const result = qcResults[c.id] || { status: 'PASS' as const, remarks: '' };
          return (
            <div key={c.id} className="flex items-center gap-3 py-1.5 border-b border-slate-700/50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{c.name}</p>
                {c.description && <p className="text-[10px] text-slate-500">{c.description}</p>}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setQcResults(prev => ({ ...prev, [c.id]: { ...result, status: 'PASS' } }))}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium border ${
                    result.status === 'PASS'
                      ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/40'
                      : 'bg-slate-700/30 text-slate-500 border-slate-700'
                  }`}
                >
                  PASS
                </button>
                <button
                  onClick={() => setQcResults(prev => ({ ...prev, [c.id]: { ...result, status: 'FAIL' } }))}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium border ${
                    result.status === 'FAIL'
                      ? 'bg-red-600/20 text-red-400 border-red-600/40'
                      : 'bg-slate-700/30 text-slate-500 border-slate-700'
                  }`}
                >
                  FAIL
                </button>
              </div>
              {result.status === 'FAIL' && (
                <input
                  className="bg-smx-bg border border-slate-600 rounded px-2 py-1 text-[10px] w-28 focus:outline-none focus:border-red-500"
                  placeholder="Issue..."
                  value={result.remarks}
                  onChange={e => setQcResults(prev => ({ ...prev, [c.id]: { ...result, remarks: e.target.value } }))}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-1">
        <div className="text-[10px]">
          {allPass ? (
            <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> All pass</span>
          ) : (
            <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> {failCount} failed</span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs hover:bg-slate-600">Cancel</button>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 ${
              allPass
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40 hover:bg-emerald-600/30'
                : 'bg-red-600/20 text-red-400 border border-red-600/40 hover:bg-red-600/30'
            }`}
          >
            {submitting ? '...' : allPass ? 'Submit QC Pass' : 'Submit QC Fail'}
          </button>
        </div>
      </div>
    </div>
  );
}
