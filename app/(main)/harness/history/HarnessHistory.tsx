'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Package, ChevronDown, ChevronUp, FileText, Clock } from 'lucide-react';
import { StatusBadge, QCReport } from '@/components/harness';
import type { HarnessUnit } from '@/components/harness';

export default function HarnessHistory({ role, userId }: { role: string; userId: string }) {
  const [units, setUnits] = useState<HarnessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [expandedUnit, setExpandedUnit] = useState<string | null>(null);

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/harness?status=QC_PASSED,READY,DISPATCHED');
      if (res.ok) setUnits(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUnits(); }, [fetchUnits]);

  // Group by order
  const orderGroups: Record<string, HarnessUnit[]> = {};
  for (const u of units) {
    const key = u.order.orderNumber;
    if (!orderGroups[key]) orderGroups[key] = [];
    orderGroups[key].push(u);
  }
  const orderKeys = Object.keys(orderGroups).sort().reverse();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Clock className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-slate-100">Harness History</h2>
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
        <div className="py-16 text-center text-slate-500 text-sm">No completed harness units yet</div>
      ) : (
        <div className="space-y-3">
          {orderKeys.map(orderNum => {
            const group = orderGroups[orderNum];
            const isExpanded = expandedOrder === orderNum;
            const readyCount = group.filter(u => u.status === 'READY' || u.status === 'DISPATCHED' || u.status === 'QC_PASSED').length;
            const dispatchedCount = group.filter(u => u.status === 'DISPATCHED').length;

            return (
              <div key={orderNum} className="rounded-xl bg-zinc-900/60 border border-slate-700/60 overflow-hidden">
                <button
                  onClick={() => setExpandedOrder(isExpanded ? null : orderNum)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <Package className="w-4 h-4 text-slate-400" />
                    <span className="font-semibold text-sm text-slate-200">{orderNum}</span>
                    <span className="text-slate-500 text-xs">{group[0].product.code}</span>
                    <span className="text-slate-600 text-[10px]">Qty {group[0].order.quantity}</span>
                    <span className="bg-emerald-600/15 text-emerald-400 px-2 py-0.5 rounded text-[10px] font-semibold">
                      {readyCount} done
                    </span>
                    {dispatchedCount > 0 && (
                      <span className="bg-sky-600/15 text-sky-400 px-2 py-0.5 rounded text-[10px] font-semibold">
                        {dispatchedCount} dispatched
                      </span>
                    )}
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
                              {unit.assignedUser && <span className="text-[11px] text-slate-500">Done by: {unit.assignedUser.name}</span>}
                              {unit.pairedController && (
                                <span className="text-[11px] text-emerald-400">Paired: {unit.pairedController.serialNumber}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 items-center shrink-0">
                            {unit.qcData && (
                              <>
                                <button
                                  onClick={() => setExpandedUnit(expandedUnit === unit.id ? null : unit.id)}
                                  className="p-2 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-600/10 transition-colors"
                                  title="Toggle QC Report"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => window.open(`/print/harness-qc/${unit.id}`, '_blank')}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/25 transition-colors"
                                  title="Print QC Report"
                                >
                                  QC PDF
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* QC Report inline */}
                        {expandedUnit === unit.id && unit.qcData && (
                          <QCReport unit={unit} />
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
