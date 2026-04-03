'use client';

import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, RefreshCw, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { StatusBadge, ActionBtn, QCScanStep, validateQCScan, QCPanel, QCReport } from '@/components/harness';
import type { HarnessUnit, Connector, QCResult } from '@/components/harness';

export default function HarnessRework({ role, userId }: { role: string; userId: string }) {
  const [units, setUnits] = useState<HarnessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [reworkUnitId, setReworkUnitId] = useState<string | null>(null);
  const [reworkRemarks, setReworkRemarks] = useState('');
  const [qcUnitId, setQcUnitId] = useState<string | null>(null);
  const [qcScanVerified, setQcScanVerified] = useState(false);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [qcResults, setQcResults] = useState<Record<string, QCResult>>({});

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/harness?status=QC_FAILED');
      if (res.ok) setUnits(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

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
        // FIX: Initialize with null (untested) -- not auto-pass
        const initial: Record<string, QCResult> = {};
        for (const c of data) {
          initial[c.id] = { status: null, remarks: '' };
        }
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
  for (const u of units) {
    const key = u.order.orderNumber;
    if (!orderGroups[key]) orderGroups[key] = [];
    orderGroups[key].push(u);
  }
  const orderKeys = Object.keys(orderGroups).sort();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <RotateCcw className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-bold text-slate-100">Harness Rework</h2>
        </div>
        <button onClick={fetchUnits} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="py-16 text-center">
          <RefreshCw className="w-5 h-5 text-slate-500 animate-spin mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Loading...</p>
        </div>
      ) : units.length === 0 ? (
        <div className="py-16 text-center text-slate-500 text-sm">No harness units pending rework</div>
      ) : (
        <div className="space-y-3">
          {orderKeys.map(orderNum => {
            const group = orderGroups[orderNum];
            const isExpanded = expandedOrder === orderNum || orderKeys.length <= 3;
            return (
              <div key={orderNum} className="rounded-xl bg-zinc-900/60 border border-slate-700/60 overflow-hidden">
                <button
                  onClick={() => setExpandedOrder(isExpanded ? null : orderNum)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <Package className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-sm text-slate-200">{orderNum}</span>
                    <span className="text-slate-500 text-xs">{group[0].product.code}</span>
                    <span className="bg-red-600/15 text-red-400 px-2 py-0.5 rounded text-[10px] font-semibold">{group.length} failed</span>
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
                        </div>

                        {/* Failed QC report inline */}
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
