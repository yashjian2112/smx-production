'use client';

import { useState, useEffect, useCallback } from 'react';
import { Cable, Package, CheckCircle2, Clock, Play, Zap, RefreshCw, ChevronDown, ChevronUp, Printer, Check, RotateCcw, FileText } from 'lucide-react';
import { StatusBadge, ActionBtn, QCScanStep, validateQCScan, QCPanel, QCReport } from '@/components/harness';
import type { HarnessUnit, Connector, QCResult } from '@/components/harness';

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
  const [allUnits, setAllUnits] = useState<HarnessUnit[]>([]); // for cross-tab counts
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [qcUnitId, setQcUnitId] = useState<string | null>(null);
  const [qcScanVerified, setQcScanVerified] = useState(false);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [qcResults, setQcResults] = useState<Record<string, QCResult>>({});
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);
  const [acceptingOrder, setAcceptingOrder] = useState<string | null>(null);
  const [printedUnits, setPrintedUnits] = useState<Set<string>>(new Set());
  const [confirmedUnits, setConfirmedUnits] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  // Fetch units for the current tab + all units for completion counts
  const fetchUnits = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const statuses = STATUS_MAP[tab].join(',');
      const [tabRes, allRes] = await Promise.all([
        fetch(`/api/harness?status=${statuses}`),
        fetch('/api/harness?status=PENDING,ACCEPTED,CRIMPING,QC_PENDING,QC_PASSED,READY'),
      ]);
      if (!tabRes.ok) {
        setError('Failed to load data. Tap refresh to retry.');
        setUnits([]);
        return;
      }
      let data: HarnessUnit[] = await tabRes.json();
      if (tab === 'completed') {
        const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
        data = data.filter(u => new Date(u.updatedAt).getTime() >= cutoff);
      }
      setUnits(data);
      if (allRes.ok) {
        setAllUnits(await allRes.json());
      }
    } catch {
      setError('Network error. Check your connection and retry.');
      setUnits([]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setUnits([]);
    setExpandedOrder(null);
    setQcUnitId(null);
    setQcScanVerified(false);
    fetchUnits();
  }, [fetchUnits]);

  // -- Actions --

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
        setActing(null);
        return;
      }
      await fetchUnits();
    } catch (e) {
      console.error(e);
    } finally {
      setActing(null);
    }
  }

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

  // -- QC Flow --

  async function openQC(unit: HarnessUnit) {
    setQcUnitId(unit.id);
    setQcScanVerified(false);
    setQcResults({});
    try {
      const res = await fetch(`/api/admin/harness-connectors?productId=${unit.productId}`);
      if (res.ok) {
        const data: Connector[] = await res.json();
        setConnectors(data);
        // FIX: Initialize ALL connectors with status: null (untested)
        // Previously they were set to 'PASS' which allowed auto-submit
        const initial: Record<string, QCResult> = {};
        for (const c of data) {
          initial[c.id] = { status: null, remarks: '' };
        }
        setQcResults(initial);
      } else {
        alert('Failed to load connector list');
        setQcUnitId(null);
      }
    } catch (e) {
      console.error(e);
      setQcUnitId(null);
    }
  }

  function handleQcScanResult(unit: HarnessUnit, scannedValue: string) {
    if (validateQCScan(unit, scannedValue)) {
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
      if (result && result.status) {
        qcDataWithNames[c.id] = { status: result.status, remarks: result.remarks, name: c.name };
      }
    }

    doAction(unit.id, action, { qcData: qcDataWithNames, remarks });
    setQcUnitId(null);
    setQcScanVerified(false);
  }

  // -- Grouping --

  const orderGroups: Record<string, HarnessUnit[]> = {};
  for (const u of units) {
    const key = u.order.orderNumber;
    if (!orderGroups[key]) orderGroups[key] = [];
    orderGroups[key].push(u);
  }
  const orderKeys = Object.keys(orderGroups).sort();

  // Completion counts per order (from allUnits)
  function getOrderCompletion(orderId: string) {
    const orderUnits = allUnits.filter(u => u.orderId === orderId);
    const total = orderUnits.length;
    const completed = orderUnits.filter(u => u.status === 'QC_PASSED' || u.status === 'READY' || u.status === 'DISPATCHED').length;
    return { total, completed };
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'pending',     label: 'Pending',     icon: <Clock className="w-4 h-4" /> },
    { key: 'in_progress', label: 'In Progress', icon: <Play className="w-4 h-4" /> },
    { key: 'qc',          label: 'QC',          icon: <Zap className="w-4 h-4" /> },
    { key: 'completed',   label: 'Completed',   icon: <Check className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Cable className="w-5 h-5 text-sky-400" />
          <h2 className="text-lg font-bold text-slate-100">Harness Production</h2>
        </div>
        <button onClick={fetchUnits} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900/80 rounded-xl p-1 border border-slate-700/50">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              tab === t.key
                ? 'bg-sky-600/20 text-sky-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 text-center">
          <RefreshCw className="w-5 h-5 text-slate-500 animate-spin mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Loading...</p>
        </div>
      ) : error ? (
        <div className="py-16 text-center space-y-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={fetchUnits} className="px-5 py-2.5 rounded-lg bg-slate-700 text-slate-200 text-sm font-medium hover:bg-slate-600 transition-colors">
            Retry
          </button>
        </div>
      ) : units.length === 0 ? (
        <div className="py-16 text-center text-slate-500">
          <p className="text-sm">
            {tab === 'completed' ? 'No completed harness units in the last 14 days' : 'No harness units in this category'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orderKeys.map(orderNum => {
            const group = orderGroups[orderNum];
            const isCollapsibleTab = tab === 'completed' || tab === 'qc';
            // Completed/QC: collapsed by default, click to open one. Others: all open by default.
            const isExpanded = isCollapsibleTab
              ? expandedOrder === orderNum
              : expandedOrder === null || expandedOrder === orderNum;
            const isPendingTab = tab === 'pending';
            const orderId = group[0].orderId;
            const { total: totalUnits, completed: completedUnits } = getOrderCompletion(orderId);

            return (
              <div key={orderNum} className="rounded-xl bg-zinc-900/60 border border-slate-700/60 overflow-hidden">
                {/* Order header */}
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    onClick={() => setExpandedOrder(isExpanded ? '__none__' : orderNum)}
                    className="flex items-center gap-2.5 text-left flex-1 min-w-0"
                  >
                    <Package className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-semibold text-sm text-slate-200">{orderNum}</span>
                    <span className="text-slate-500 text-xs">{group[0].product.code}</span>
                    <span className="text-slate-600 text-[10px]">Qty {group[0].order.quantity}</span>
                    {/* Completion progress badge */}
                    {totalUnits > 0 && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        completedUnits === totalUnits
                          ? 'bg-emerald-600/20 text-emerald-400'
                          : completedUnits > 0
                            ? 'bg-sky-600/15 text-sky-400'
                            : 'bg-slate-700/50 text-slate-500'
                      }`}>
                        {completedUnits}/{totalUnits} done
                      </span>
                    )}
                    <span className="bg-slate-700/40 text-slate-400 px-1.5 py-0.5 rounded text-[10px]">
                      {group.length} here
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  </button>
                  {isPendingTab && (
                    <ActionBtn
                      label={acceptingOrder === orderId ? '...' : 'Accept Order'}
                      color="sky"
                      loading={acceptingOrder === orderId}
                      onClick={() => acceptOrder(orderId)}
                    />
                  )}
                  {tab === 'completed' && group.some(u => u.qcData) && (
                    <a
                      href={`/print/harness-qc-batch?ids=${group.filter(u => u.qcData).map(u => u.id).join(',')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/25 transition-colors shrink-0"
                      title="Print all QC reports for this order"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print All QC
                    </a>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-700/50 divide-y divide-slate-700/30">
                    {group.map((unit, idx) => {
                      const isUnitOpen = expandedUnit === unit.id;

                      return (
                        <div key={unit.id} className="px-4 py-3">
                          {/* Unit header — clickable in completed/QC tabs */}
                          <div
                            className={`flex items-center justify-between gap-3 ${isCollapsibleTab ? 'cursor-pointer' : ''}`}
                            onClick={isCollapsibleTab ? () => setExpandedUnit(isUnitOpen ? null : unit.id) : undefined}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                {unit.barcode ? (
                                  <span className={`font-mono text-sm font-semibold ${
                                    unit.remarks && unit.remarks.toLowerCase().includes('rework')
                                      ? 'text-red-400'
                                      : 'text-sky-300'
                                  }`}>{unit.barcode}</span>
                                ) : (
                                  <span className="text-sm text-slate-500">Harness {idx + 1}</span>
                                )}
                                <StatusBadge status={unit.status} />
                                {isCollapsibleTab && unit.qcData && (
                                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                    Object.values(unit.qcData).every((v: { status: string }) => v.status === 'PASS')
                                      ? 'bg-emerald-600/15 text-emerald-400'
                                      : 'bg-red-600/15 text-red-400'
                                  }`}>
                                    {Object.values(unit.qcData).every((v: { status: string }) => v.status === 'PASS') ? 'All Passed' : 'Failed'}
                                  </span>
                                )}
                                {isCollapsibleTab && (
                                  isUnitOpen
                                    ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                                    : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                                )}
                              </div>
                              {/* Show model/assigned only when expanded or non-collapsible */}
                              {(!isCollapsibleTab || isUnitOpen) && (
                                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
                                  {unit.harnessModel && (
                                    <span className="text-[11px] text-sky-400/80">Model: {unit.harnessModel}</span>
                                  )}
                                  {unit.assignedUser && (
                                    <span className="text-[11px] text-slate-500">Assigned: {unit.assignedUser.name}</span>
                                  )}
                                </div>
                              )}
                              {(!isCollapsibleTab || isUnitOpen) && unit.remarks && (
                                <p className="text-[11px] text-amber-400 mt-1">{unit.remarks}</p>
                              )}
                            </div>

                            {/* Actions — always visible for action tabs, only when expanded for collapsible tabs */}
                            {(!isCollapsibleTab || isUnitOpen) && (
                              <div className="flex gap-2 items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                                {/* QC Report: only in completed tab */}
                                {(unit.status === 'QC_PASSED' || unit.status === 'READY') && unit.qcData && (
                                  <a
                                    href={`/print/harness-qc/${unit.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/25 transition-colors"
                                    title="View QC Report"
                                  >
                                    <FileText className="w-3.5 h-3.5" /> QC Report
                                  </a>
                                )}

                                {/* Stage actions */}
                                {unit.status === 'ACCEPTED' && (
                                  <ActionBtn label="Start Crimping" color="amber" loading={acting === unit.id} onClick={() => doAction(unit.id, 'start_crimping')} />
                                )}
                                {/* CRIMPING: Step 1 → Print Barcode, Step 2 → Confirm, Step 3 → Crimping Done */}
                                {unit.status === 'CRIMPING' && unit.barcode && !printedUnits.has(unit.id) && (
                                  <a
                                    href={`/print/harness/${unit.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setPrintedUnits(prev => new Set(prev).add(unit.id))}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-sky-600/15 text-sky-400 border border-sky-500/30 hover:bg-sky-600/25 transition-colors"
                                  >
                                    <Printer className="w-3.5 h-3.5" /> Print Barcode
                                  </a>
                                )}
                                {unit.status === 'CRIMPING' && printedUnits.has(unit.id) && !confirmedUnits.has(unit.id) && (
                                  <button
                                    onClick={() => setConfirmedUnits(prev => new Set(prev).add(unit.id))}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-amber-600/15 text-amber-400 border border-amber-500/30 hover:bg-amber-600/25 transition-colors"
                                  >
                                    <Check className="w-3.5 h-3.5" /> Confirm Printed
                                  </button>
                                )}
                                {unit.status === 'CRIMPING' && confirmedUnits.has(unit.id) && (
                                  <ActionBtn label="Crimping Done" color="emerald" loading={acting === unit.id} onClick={() => doAction(unit.id, 'crimping_done')} />
                                )}
                                {unit.status === 'QC_PENDING' && (
                                  <ActionBtn label="Start QC" color="purple" loading={acting === unit.id} onClick={() => openQC(unit)} />
                                )}
                              </div>
                            )}
                          </div>

                          {/* Expanded details — QC flow and QC report */}
                          {(!isCollapsibleTab || isUnitOpen) && (
                            <>
                              {/* QC Flow inline */}
                              {qcUnitId === unit.id && (
                                !qcScanVerified ? (
                                  <QCScanStep
                                    onVerified={(val) => handleQcScanResult(unit, val)}
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

                              {/* Inline QC report for completed tab */}
                              {tab === 'completed' && unit.qcData && qcUnitId !== unit.id && (
                                <QCReport unit={unit} defaultOpen />
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Completed tab date note */}
      {tab === 'completed' && units.length > 0 && (
        <p className="text-center text-[10px] text-slate-600">Showing last 14 days</p>
      )}
    </div>
  );
}
