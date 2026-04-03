'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, RefreshCw, Package, ChevronDown, ChevronUp, FileText, Clock } from 'lucide-react';

type HarnessUnit = {
  id: string;
  serialNumber: string | null;
  barcode: string | null;
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
  const orderKeys = Object.keys(orderGroups).sort().reverse(); // newest first

  const badgeCls = (status: string) => {
    const map: Record<string, string> = {
      QC_PASSED:  'bg-emerald-600/20 text-emerald-400',
      READY:      'bg-green-600/20 text-green-400',
      DISPATCHED: 'bg-sky-600/20 text-sky-400',
    };
    return `px-2 py-0.5 rounded text-[10px] font-medium ${map[status] || 'bg-slate-600/30 text-slate-400'}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold">Harness History</h2>
        </div>
        <button onClick={fetchUnits} className="text-slate-400 hover:text-white p-1" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm">Loading...</div>
      ) : units.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-sm">No completed harness units yet</div>
      ) : (
        <div className="space-y-3">
          {orderKeys.map(orderNum => {
            const group = orderGroups[orderNum];
            const isExpanded = expandedOrder === orderNum;
            const readyCount = group.filter(u => u.status === 'READY' || u.status === 'DISPATCHED' || u.status === 'QC_PASSED').length;
            const dispatchedCount = group.filter(u => u.status === 'DISPATCHED').length;

            return (
              <div key={orderNum} className="rounded-xl bg-smx-surface border border-slate-700 overflow-hidden">
                <button
                  onClick={() => setExpandedOrder(isExpanded ? null : orderNum)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Package className="w-4 h-4 text-slate-400" />
                    <span className="font-medium text-sm">{orderNum}</span>
                    <span className="text-slate-500 text-xs">{group[0].product.code}</span>
                    <span className="text-slate-600 text-[10px]">Qty: {group[0].order.quantity}</span>
                    <span className="bg-emerald-600/15 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-medium">
                      {readyCount} done
                    </span>
                    {dispatchedCount > 0 && (
                      <span className="bg-sky-600/15 text-sky-400 px-1.5 py-0.5 rounded text-[10px] font-medium">
                        {dispatchedCount} dispatched
                      </span>
                    )}
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
                              <span className="font-mono text-sm text-sky-300">{unit.barcode || 'N/A'}</span>
                              <span className={badgeCls(unit.status)}>{unit.status.replace(/_/g, ' ')}</span>
                            </div>
                            {unit.serialNumber && <p className="text-[10px] text-slate-500 mt-0.5">SN: {unit.serialNumber}</p>}
                            {unit.assignedUser && <p className="text-[10px] text-slate-500">Done by: {unit.assignedUser.name}</p>}
                            {unit.pairedController && (
                              <p className="text-[10px] text-emerald-400 mt-0.5">Paired: {unit.pairedController.serialNumber}</p>
                            )}
                          </div>
                          <div className="flex gap-2 items-center shrink-0">
                            {/* QC Report */}
                            {unit.qcData && (
                              <button
                                onClick={() => setExpandedUnit(expandedUnit === unit.id ? null : unit.id)}
                                className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-600/10"
                                title="View QC Report"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            )}
                            {/* Print QC Report PDF */}
                            {unit.qcData && (
                              <button
                                onClick={() => window.open(`/print/harness-qc/${unit.id}`, '_blank')}
                                className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-emerald-600/15 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/25"
                                title="Print QC Report"
                              >
                                QC PDF
                              </button>
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

// ── QC Report ──
function QCReport({ unit }: { unit: HarnessUnit }) {
  const qcData = unit.qcData;
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
            {result.remarks && <span className="text-[10px] text-slate-500 italic">— {result.remarks}</span>}
          </div>
        ))}
      </div>
      {unit.remarks && (
        <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-700/50">{unit.remarks}</p>
      )}
    </div>
  );
}
