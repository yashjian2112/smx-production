'use client';

import { useState, useEffect, useCallback } from 'react';
import { Cable, Package, CheckCircle2, XCircle, Clock, Play, Zap, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

type HarnessUnit = {
  id: string;
  serialNumber: string;
  barcode: string;
  orderId: string;
  productId: string;
  assignedUserId: string | null;
  status: string;
  qcData: Record<string, { status: string; remarks?: string }> | null;
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
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [qcResults, setQcResults] = useState<Record<string, { status: 'PASS' | 'FAIL'; remarks: string }>>({});
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

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

  function submitQC(unit: HarnessUnit) {
    const allPass = Object.values(qcResults).every(r => r.status === 'PASS');
    const action = allPass ? 'qc_pass' : 'qc_fail';
    const failedNames = connectors
      .filter(c => qcResults[c.id]?.status === 'FAIL')
      .map(c => c.name);
    const remarks = allPass ? 'All connectors passed' : `Failed: ${failedNames.join(', ')}`;
    doAction(unit.id, action, { qcData: qcResults, remarks });
    setQcUnitId(null);
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
                          <div>
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
                          <div className="flex gap-2">
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
                              <ActionBtn
                                label={unit.status === 'QC_FAILED' ? 'Re-test QC' : 'Start QC'}
                                color="purple"
                                loading={acting === unit.id}
                                onClick={() => openQC(unit)}
                              />
                            )}
                          </div>
                        </div>

                        {/* QC Panel (inline) */}
                        {qcUnitId === unit.id && (
                          <QCPanel
                            connectors={connectors}
                            qcResults={qcResults}
                            setQcResults={setQcResults}
                            onSubmit={() => submitQC(unit)}
                            onCancel={() => setQcUnitId(null)}
                            submitting={acting === unit.id}
                          />
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
      <p className="text-xs font-medium text-purple-400">Connector QC Test</p>
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
