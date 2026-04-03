'use client';

import { useState, useEffect, useCallback } from 'react';
import { Cable, Package, CheckCircle2, XCircle, Clock, Play, Zap, RefreshCw, ChevronDown, ChevronUp, Printer, ScanLine, FileText, RotateCcw, User, Calendar, Hash } from 'lucide-react';
import { ScanInput } from '@/components/ScanInput';

type HarnessUnit = {
  id: string;
  serialNumber: string;
  barcode: string;
  orderId: string;
  productId: string;
  assignedUserId: string | null;
  status: string;
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

type Tab = 'pending' | 'in_progress' | 'qc' | 'ready';

const STATUS_MAP: Record<Tab, string[]> = {
  pending:     ['PENDING'],
  in_progress: ['ACCEPTED', 'CRIMPING'],
  qc:          ['QC_PENDING', 'QC_FAILED'],
  ready:       ['QC_PASSED', 'READY', 'DISPATCHED'],
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
  // Job card / QC report expanded
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const [jobCardUnit, setJobCardUnit] = useState<string | null>(null);
  // Rework remarks
  const [reworkRemarks, setReworkRemarks] = useState('');
  const [showReworkDialog, setShowReworkDialog] = useState<string | null>(null);

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    try {
      const statuses = STATUS_MAP[tab].join(',');
      const res = await fetch(`/api/harness?status=${statuses}`);
      if (res.ok) setUnits(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // ── Actions ──
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
      // If start_crimping, open print window
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
        // Pre-fill from existing qcData if re-testing
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
    if (val === unit.barcode.toUpperCase() || val === unit.serialNumber.toUpperCase()) {
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

    // Build qcData with connector names included (for QC report display later)
    const qcDataWithNames: Record<string, { status: string; remarks: string; name: string }> = {};
    for (const c of connectors) {
      const result = qcResults[c.id];
      if (result) {
        qcDataWithNames[c.id] = {
          status: result.status,
          remarks: result.remarks,
          name: c.name,
        };
      }
    }

    doAction(unit.id, action, { qcData: qcDataWithNames, remarks });
    setQcUnitId(null);
    setQcScanVerified(false);
  }

  // ── Rework ──
  function handleRework(unitId: string) {
    doAction(unitId, 'rework', { remarks: reworkRemarks || undefined });
    setShowReworkDialog(null);
    setReworkRemarks('');
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
    { key: 'ready',       label: 'Ready',       icon: <CheckCircle2 className="w-4 h-4" /> },
  ];

  const badgeCls = (status: string) => {
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
  };

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
        <div className="py-12 text-center text-slate-500 text-sm">No harness units in this category</div>
      ) : (
        <div className="space-y-3">
          {orderKeys.map(orderNum => {
            const group = orderGroups[orderNum];
            const isExpanded = expandedOrder === orderNum || orderKeys.length === 1;
            return (
              <div key={orderNum} className="rounded-xl bg-smx-surface border border-slate-700 overflow-hidden">
                <button
                  onClick={() => setExpandedOrder(isExpanded ? null : orderNum)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-sm">{orderNum}</span>
                    <span className="text-slate-500 text-xs">{group[0].product.code}</span>
                    <span className="text-slate-600 text-[10px]">{group.length} unit{group.length > 1 ? 's' : ''}</span>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                {isExpanded && (
                  <div className="border-t border-slate-700 divide-y divide-slate-700/50">
                    {group.map(unit => (
                      <div key={unit.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-sky-300">{unit.barcode}</span>
                              <span className={badgeCls(unit.status)}>{unit.status.replace(/_/g, ' ')}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">SN: {unit.serialNumber}</p>
                            {unit.assignedUser && (
                              <p className="text-[10px] text-slate-500">Assigned: {unit.assignedUser.name}</p>
                            )}
                            {unit.pairedController && (
                              <p className="text-[10px] text-emerald-400 mt-0.5">
                                Paired: {unit.pairedController.serialNumber}
                              </p>
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
                            {/* Print barcode button — for crimping/qc stages */}
                            {(unit.status === 'CRIMPING' || unit.status === 'QC_PENDING' || unit.status === 'QC_FAILED') && (
                              <button
                                onClick={() => window.open(`/print/harness/${unit.id}`, '_blank')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50"
                                title="Print barcode label"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            )}
                            {/* QC Report — for passed/ready units */}
                            {(unit.status === 'QC_PASSED' || unit.status === 'READY' || unit.status === 'DISPATCHED') && unit.qcData && (
                              <button
                                onClick={() => setExpandedUnit(expandedUnit === unit.id ? null : unit.id)}
                                className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-600/10"
                                title="View QC Report"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            )}
                            {/* Action buttons based on status */}
                            {unit.status === 'PENDING' && (
                              <ActionBtn
                                label="Accept"
                                color="sky"
                                loading={acting === unit.id}
                                onClick={() => doAction(unit.id, 'accept')}
                              />
                            )}
                            {unit.status === 'ACCEPTED' && (
                              <ActionBtn
                                label="Start Crimping"
                                color="amber"
                                loading={acting === unit.id}
                                onClick={() => doAction(unit.id, 'start_crimping')}
                              />
                            )}
                            {unit.status === 'CRIMPING' && (
                              <ActionBtn
                                label="Crimping Done"
                                color="emerald"
                                loading={acting === unit.id}
                                onClick={() => doAction(unit.id, 'crimping_done')}
                              />
                            )}
                            {(unit.status === 'QC_PENDING' || unit.status === 'QC_FAILED') && (
                              <>
                                <ActionBtn
                                  label={unit.status === 'QC_FAILED' ? 'Re-test QC' : 'Start QC'}
                                  color="purple"
                                  loading={acting === unit.id}
                                  onClick={() => openQC(unit)}
                                />
                                {/* Rework button for QC_FAILED */}
                                {unit.status === 'QC_FAILED' && (
                                  <button
                                    onClick={() => { setShowReworkDialog(unit.id); setReworkRemarks(''); }}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium bg-orange-600/20 text-orange-400 border-orange-600/40 hover:bg-orange-600/30"
                                    title="Send to rework"
                                  >
                                    <RotateCcw className="w-3 h-3" /> Rework
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Job card (inline) */}
                        {jobCardUnit === unit.id && (
                          <JobCard unit={unit} />
                        )}

                        {/* Rework dialog (inline) */}
                        {showReworkDialog === unit.id && (
                          <div className="mt-3 p-3 rounded-lg bg-smx-bg border border-orange-600/30 space-y-3">
                            <div className="flex items-center gap-2">
                              <RotateCcw className="w-4 h-4 text-orange-400" />
                              <p className="text-xs font-medium text-orange-400">Send to Rework</p>
                            </div>
                            <p className="text-[10px] text-slate-500">
                              This will send harness <span className="text-sky-300 font-mono">{unit.barcode}</span> back to crimping. Previous QC data will be cleared.
                            </p>
                            <input
                              className="w-full bg-smx-bg border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                              placeholder="Rework reason (optional)..."
                              value={reworkRemarks}
                              onChange={e => setReworkRemarks(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setShowReworkDialog(null)}
                                className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs hover:bg-slate-600"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleRework(unit.id)}
                                disabled={acting === unit.id}
                                className="px-3 py-1.5 rounded-lg bg-orange-600/20 text-orange-400 border border-orange-600/40 hover:bg-orange-600/30 text-xs font-medium disabled:opacity-40"
                              >
                                {acting === unit.id ? '...' : 'Confirm Rework'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* QC Report inline (for Ready tab) */}
                        {expandedUnit === unit.id && unit.qcData && (
                          <QCReport unit={unit} />
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

// ── Action Button ──
function ActionBtn({ label, color, loading, onClick }: { label: string; color: string; loading: boolean; onClick: () => void }) {
  const colorMap: Record<string, string> = {
    sky:     'bg-sky-600/20 text-sky-400 border-sky-600/40 hover:bg-sky-600/30',
    amber:   'bg-amber-600/20 text-amber-400 border-amber-600/40 hover:bg-amber-600/30',
    emerald: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/40 hover:bg-emerald-600/30',
    purple:  'bg-purple-600/20 text-purple-400 border-purple-600/40 hover:bg-purple-600/30',
    red:     'bg-red-600/20 text-red-400 border-red-600/40 hover:bg-red-600/30',
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

// ── Job Card (detailed view per unit) ──
function JobCard({ unit }: { unit: HarnessUnit }) {
  const createdDate = new Date(unit.createdAt);
  const updatedDate = new Date(unit.updatedAt);

  const statusFlow = ['PENDING', 'ACCEPTED', 'CRIMPING', 'QC_PENDING', 'QC_PASSED', 'READY', 'DISPATCHED'];
  const currentIdx = statusFlow.indexOf(unit.status === 'QC_FAILED' ? 'QC_PENDING' : unit.status);

  return (
    <div className="mt-3 p-4 rounded-lg bg-smx-bg border border-slate-600/50 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cable className="w-4 h-4 text-sky-400" />
          <span className="text-sm font-semibold text-sky-300">Job Card</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono">{unit.id.slice(0, 8)}</span>
      </div>

      {/* Details grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Barcode</p>
          <p className="font-mono text-sky-300">{unit.barcode}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Serial Number</p>
          <p className="font-mono text-slate-200">{unit.serialNumber}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Product</p>
          <p className="text-slate-200">{unit.product.code} &mdash; {unit.product.name}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Order</p>
          <p className="text-slate-200">{unit.order.orderNumber}</p>
        </div>
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
                <div
                  className={`w-full h-1.5 rounded-full ${
                    isFailed ? 'bg-red-500' :
                    isDone ? 'bg-sky-500' : 'bg-slate-700'
                  }`}
                />
                <span className={`text-[8px] leading-tight text-center ${
                  isCurrent ? (isFailed ? 'text-red-400 font-medium' : 'text-sky-400 font-medium') :
                  isDone ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  {s.replace(/_/g, ' ').replace('QC ', 'QC\n')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Paired controller info */}
      {unit.pairedController && (
        <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)' }}>
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">Paired Controller</span>
          <span className="font-mono text-sm text-emerald-300">{unit.pairedController.serialNumber}</span>
        </div>
      )}

      {/* QC summary if available */}
      {unit.qcData && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">QC Results</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(unit.qcData).map(([connId, result]) => (
              <span
                key={connId}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${
                  result.status === 'PASS'
                    ? 'bg-emerald-600/15 text-emerald-400'
                    : 'bg-red-600/15 text-red-400'
                }`}
              >
                {result.status === 'PASS' ? (
                  <CheckCircle2 className="w-2.5 h-2.5" />
                ) : (
                  <XCircle className="w-2.5 h-2.5" />
                )}
                {result.name || connId.slice(0, 8)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Remarks */}
      {unit.remarks && (
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Remarks</p>
          <p className="text-xs text-amber-400">{unit.remarks}</p>
        </div>
      )}

      {/* Timestamps */}
      <div className="flex justify-between text-[10px] text-slate-600 pt-2 border-t border-slate-700/50">
        <span>Last updated: {updatedDate.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
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
    if (v === unit.barcode.toUpperCase() || v === unit.serialNumber.toUpperCase()) {
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
        Scan the barcode label on harness <span className="text-sky-300 font-mono">{unit.barcode}</span> to verify identity before QC testing.
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
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs hover:bg-slate-600"
        >
          Cancel
        </button>
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
            <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> {failCount} connector{failCount > 1 ? 's' : ''} failed</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs hover:bg-slate-600"
          >
            Cancel
          </button>
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

// ── QC Report (inline, shown in Ready tab) ──
function QCReport({ unit }: { unit: HarnessUnit }) {
  const qcData = unit.qcData as Record<string, { status: string; remarks?: string; name?: string }> | null;
  if (!qcData) return null;

  const entries = Object.entries(qcData);
  const allPassed = entries.every(([, v]) => v.status === 'PASS');
  const failedCount = entries.filter(([, v]) => v.status === 'FAIL').length;

  return (
    <div className="mt-3 p-3 rounded-lg border space-y-2" style={{
      background: allPassed ? 'rgba(74,222,128,0.04)' : 'rgba(248,113,113,0.04)',
      borderColor: allPassed ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)',
    }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4" style={{ color: allPassed ? '#4ade80' : '#f87171' }} />
          <p className="text-xs font-medium" style={{ color: allPassed ? '#4ade80' : '#f87171' }}>
            QC Report — {allPassed ? 'PASSED' : `FAILED (${failedCount})`}
          </p>
        </div>
        <span className="text-[10px] text-slate-500">{unit.barcode}</span>
      </div>
      <div className="space-y-1">
        {entries.map(([connId, result]) => (
          <div key={connId} className="flex items-center gap-2 text-xs">
            {result.status === 'PASS' ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-3 h-3 text-red-400 shrink-0" />
            )}
            <span className={result.status === 'PASS' ? 'text-slate-300' : 'text-red-300'}>
              {result.name || connId.slice(0, 8)}
            </span>
            <span className={`text-[10px] font-medium ${result.status === 'PASS' ? 'text-emerald-400' : 'text-red-400'}`}>
              {result.status}
            </span>
            {result.remarks && (
              <span className="text-[10px] text-slate-500 italic">— {result.remarks}</span>
            )}
          </div>
        ))}
      </div>
      {unit.remarks && (
        <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-700/50">{unit.remarks}</p>
      )}
    </div>
  );
}
