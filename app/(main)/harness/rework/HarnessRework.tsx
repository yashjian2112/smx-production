'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { RotateCcw, RefreshCw, Package, ChevronDown, ChevronUp, Clock, Play, Check, Search } from 'lucide-react';
import { StatusBadge, ActionBtn, QCScanStep, validateQCScan, QCPanel, QCReport } from '@/components/harness';
import type { HarnessUnit, Connector, QCResult } from '@/components/harness';

type Tab = 'pending' | 'processing' | 'completed';

export default function HarnessRework({ role, userId }: { role: string; userId: string }) {
  const [tab, setTab] = useState<Tab>('pending');
  const [allUnits, setAllUnits] = useState<HarnessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [reworkUnitId, setReworkUnitId] = useState<string | null>(null);
  const [reworkRemarks, setReworkRemarks] = useState('');
  const [qcUnitId, setQcUnitId] = useState<string | null>(null);
  const [qcScanVerified, setQcScanVerified] = useState(false);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [qcResults, setQcResults] = useState<Record<string, QCResult>>({});
  const [search, setSearch] = useState('');

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all statuses relevant to rework flow
      const res = await fetch('/api/harness?status=QC_FAILED,CRIMPING,QC_PENDING,READY');
      if (res.ok) setAllUnits(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // Reset state on tab change
  useEffect(() => {
    setExpandedOrder(null);
    setReworkUnitId(null);
    setQcUnitId(null);
    setQcScanVerified(false);
    setSearch('');
  }, [tab]);

  // Filter units by tab
  const isReworkUnit = (u: HarnessUnit) => u.reworkCount > 0;

  const pendingUnits = useMemo(() =>
    allUnits.filter(u => u.status === 'QC_FAILED'), [allUnits]);

  const processingUnits = useMemo(() =>
    allUnits.filter(u =>
      (u.status === 'CRIMPING' || u.status === 'QC_PENDING') && isReworkUnit(u)
    ), [allUnits]);

  const completedUnits = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // last 30 days
    return allUnits.filter(u =>
      u.status === 'READY' && isReworkUnit(u) &&
      new Date(u.updatedAt).getTime() >= cutoff
    );
  }, [allUnits]);

  const units = tab === 'pending' ? pendingUnits
    : tab === 'processing' ? processingUnits
    : completedUnits;

  // Search filter for completed tab
  const filteredUnits = useMemo(() => {
    if (tab !== 'completed' || !search.trim()) return units;
    const q = search.trim().toLowerCase();
    return units.filter(u =>
      (u.barcode && u.barcode.toLowerCase().includes(q)) ||
      (u.serialNumber && u.serialNumber.toLowerCase().includes(q)) ||
      u.order.orderNumber.toLowerCase().includes(q) ||
      u.product.code.toLowerCase().includes(q) ||
      (u.harnessModel && u.harnessModel.toLowerCase().includes(q))
    );
  }, [units, search, tab]);

  // Tab counts
  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'pending',    label: 'Pending',    icon: <Clock className="w-3.5 h-3.5" />,  count: pendingUnits.length },
    { key: 'processing', label: 'Processing', icon: <Play className="w-3.5 h-3.5" />,   count: processingUnits.length },
    { key: 'completed',  label: 'Completed',  icon: <Check className="w-3.5 h-3.5" />,  count: completedUnits.length },
  ];

  // Actions
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
    } catch (e) { console.error(e); }
    finally { setActing(null); }
  }

  function handleRework(unitId: string) {
    doAction(unitId, 'rework', { remarks: reworkRemarks || undefined });
    setReworkUnitId(null);
    setReworkRemarks('');
  }

  async function openQC(unit: HarnessUnit) {
    setQcUnitId(unit.id);
    setQcScanVerified(false);
    setQcResults({});
    try {
      const res = await fetch(`/api/admin/harness-connectors?productId=${unit.productId}`);
      if (res.ok) {
        const data: Connector[] = await res.json();
        setConnectors(data);
        const initial: Record<string, QCResult> = {};
        for (const c of data) initial[c.id] = { status: null, remarks: '' };
        setQcResults(initial);
      }
    } catch (e) { console.error(e); }
  }

  function handleQcScanResult(unit: HarnessUnit, scannedValue: string) {
    if (validateQCScan(unit, scannedValue)) {
      setQcScanVerified(true);
    } else {
      alert('Barcode does not match. Scan the correct barcode.');
    }
  }

  function submitQC(unit: HarnessUnit) {
    const allPass = Object.values(qcResults).every(r => r.status === 'PASS');
    const action = allPass ? 'qc_pass' : 'qc_fail';
    const failedNames = connectors.filter(c => qcResults[c.id]?.status === 'FAIL').map(c => c.name);
    const remarks = allPass ? 'All connectors passed' : `Failed: ${failedNames.join(', ')}`;
    const qcDataWithNames: Record<string, { status: string; remarks: string; name: string }> = {};
    for (const c of connectors) {
      const result = qcResults[c.id];
      if (result && result.status) {
        qcDataWithNames[c.id] = { status: result.status, remarks: result.remarks, name: c.name };
      }
    }
    doAction(unit.id, action, { qcData: qcDataWithNames, remarks });
    setQcUnitId(null);
    setQcScanVerified(false);
  }

  // Group by order
  const orderGroups: Record<string, HarnessUnit[]> = {};
  for (const u of filteredUnits) {
    const key = u.order.orderNumber;
    if (!orderGroups[key]) orderGroups[key] = [];
    orderGroups[key].push(u);
  }
  const orderKeys = Object.keys(orderGroups).sort();

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <RotateCcw className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-bold text-slate-100">Harness Rework</h2>
        </div>
        <button onClick={fetchUnits} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium rounded-lg transition-all ${
              tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            style={tab === t.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}
          >
            {t.icon}
            {t.label}
            {t.count > 0 && (
              <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(14,165,233,0.2)' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search bar — completed tab only */}
      {tab === 'completed' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search barcode, order, product..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg text-sm text-white bg-transparent outline-none placeholder-zinc-600"
            style={{ border: '1px solid rgba(255,255,255,0.1)' }}
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center">
          <RefreshCw className="w-5 h-5 text-slate-500 animate-spin mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Loading...</p>
        </div>
      ) : filteredUnits.length === 0 ? (
        <div className="py-16 text-center text-slate-500 text-sm">
          {tab === 'pending' ? 'No harness units pending rework' :
           tab === 'processing' ? 'No units currently being reworked' :
           search ? 'No matching results' : 'No completed rework items'}
        </div>
      ) : (
        <div className="space-y-3">
          {orderKeys.map(orderNum => {
            const group = orderGroups[orderNum];
            const isCollapsible = tab === 'completed';
            const isExpanded = isCollapsible
              ? expandedOrder === orderNum
              : expandedOrder === orderNum || expandedOrder === null;

            return (
              <div key={orderNum} className="rounded-xl bg-zinc-900/60 border border-slate-700/60 overflow-hidden">
                <button
                  onClick={() => setExpandedOrder(isExpanded ? '__none__' : orderNum)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Package className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-sm text-slate-200">{orderNum}</span>
                    <span className="text-slate-500 text-xs">{group[0].product.code}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                      tab === 'pending' ? 'bg-red-600/15 text-red-400' :
                      tab === 'processing' ? 'bg-orange-600/15 text-orange-400' :
                      'bg-emerald-600/15 text-emerald-400'
                    }`}>
                      {group.length} {tab === 'pending' ? 'failed' : tab === 'processing' ? 'in progress' : 'done'}
                    </span>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-700/50 divide-y divide-slate-700/30">
                    {group.map(unit => (
                      <div key={unit.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-semibold text-sky-300">{unit.barcode || 'N/A'}</span>
                              <StatusBadge status={unit.status} />
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                              {unit.harnessModel && <span className="text-[11px] text-sky-400/80">Model: {unit.harnessModel}</span>}
                              {unit.assignedUser && <span className="text-[11px] text-slate-500">Assigned: {unit.assignedUser.name}</span>}
                            </div>
                            {unit.remarks && <p className="text-[11px] text-red-400 mt-1">{unit.remarks}</p>}
                          </div>

                          {/* Actions — only for pending tab */}
                          {tab === 'pending' && (
                            <div className="flex gap-2 items-center shrink-0">
                              <ActionBtn
                                label="Re-test QC"
                                color="purple"
                                loading={acting === unit.id}
                                onClick={() => openQC(unit)}
                              />
                              <ActionBtn
                                label="Rework"
                                color="orange"
                                icon={<RotateCcw className="w-3 h-3" />}
                                onClick={() => { setReworkUnitId(unit.id); setReworkRemarks(''); }}
                              />
                            </div>
                          )}
                        </div>

                        {/* QC report inline */}
                        {unit.qcData && qcUnitId !== unit.id && reworkUnitId !== unit.id && (
                          <QCReport unit={unit} />
                        )}

                        {/* Rework dialog */}
                        {reworkUnitId === unit.id && (
                          <div className="mt-3 p-4 rounded-xl bg-zinc-900/80 border border-orange-500/30 space-y-3">
                            <div className="flex items-center gap-2">
                              <RotateCcw className="w-4 h-4 text-orange-400" />
                              <p className="text-sm font-medium text-orange-300">Send to Rework</p>
                            </div>
                            <p className="text-xs text-slate-400">
                              This will send <span className="text-sky-300 font-mono">{unit.barcode || 'this harness'}</span> back to crimping. QC data will be cleared.
                            </p>
                            <input
                              className="w-full bg-zinc-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500/60"
                              placeholder="Rework reason (optional)..."
                              value={reworkRemarks}
                              onChange={e => setReworkRemarks(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setReworkUnitId(null)} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-xs font-medium hover:bg-slate-600 transition-colors">Cancel</button>
                              <ActionBtn
                                label="Confirm Rework"
                                color="orange"
                                loading={acting === unit.id}
                                onClick={() => handleRework(unit.id)}
                              />
                            </div>
                          </div>
                        )}

                        {/* QC re-test flow */}
                        {qcUnitId === unit.id && (
                          !qcScanVerified ? (
                            <QCScanStep
                              title="Scan Barcode to Re-test"
                              onVerified={v => handleQcScanResult(unit, v)}
                              onCancel={() => { setQcUnitId(null); setQcScanVerified(false); }}
                            />
                          ) : (
                            <QCPanel
                              title="Re-test QC"
                              connectors={connectors}
                              qcResults={qcResults}
                              setQcResults={setQcResults}
                              onSubmit={() => submitQC(unit)}
                              onCancel={() => { setQcUnitId(null); setQcScanVerified(false); }}
                              submitting={acting === unit.id}
                              previousFailedConnectors={
                                unit.previousQcData
                                  ? Object.entries(unit.previousQcData)
                                      .filter(([, v]) => v.status === 'FAIL')
                                      .map(([id]) => id)
                                  : undefined
                              }
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

      {tab === 'completed' && filteredUnits.length > 0 && (
        <p className="text-center text-[10px] text-slate-600">Showing last 30 days</p>
      )}
    </div>
  );
}
