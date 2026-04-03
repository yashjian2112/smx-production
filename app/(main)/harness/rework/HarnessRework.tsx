'use client';

import { useState, useEffect, useCallback } from 'react';
import { RotateCcw, RefreshCw, Package, CheckCircle2, XCircle, ChevronDown, ChevronUp, Printer, ScanLine, Cable } from 'lucide-react';
import { ScanInput } from '@/components/ScanInput';

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

type Connector = {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

export default function HarnessRework({ role, userId }: { role: string; userId: string }) {
  const [units, setUnits] = useState<HarnessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  // Rework dialog
  const [reworkUnitId, setReworkUnitId] = useState<string | null>(null);
  const [reworkRemarks, setReworkRemarks] = useState('');
  // QC re-test
  const [qcUnitId, setQcUnitId] = useState<string | null>(null);
  const [qcScanVerified, setQcScanVerified] = useState(false);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [qcResults, setQcResults] = useState<Record<string, { status: 'PASS' | 'FAIL'; remarks: string }>>({});

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

  // ── QC re-test flow ──
  async function openQC(unit: HarnessUnit) {
    setQcUnitId(unit.id);
    setQcScanVerified(false);
    setQcResults({});
    try {
      const res = await fetch(`/api/admin/harness-connectors?productId=${unit.productId}`);
      if (res.ok) {
        const data = await res.json();
        setConnectors(data);
        const initial: typeof qcResults = {};
        for (const c of data) {
          initial[c.id] = { status: 'PASS' as const, remarks: '' };
        }
        setQcResults(initial);
      }
    } catch (e) { console.error(e); }
  }

  function handleQcScan(unit: HarnessUnit, scannedValue: string) {
    const val = scannedValue.trim().toUpperCase();
    const barcodeMatch = unit.barcode && val === unit.barcode.toUpperCase();
    const serialMatch = unit.serialNumber && val === unit.serialNumber.toUpperCase();
    if (barcodeMatch || serialMatch) {
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
      if (result) qcDataWithNames[c.id] = { status: result.status, remarks: result.remarks, name: c.name };
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

  const badgeCls = (status: string) => {
    const map: Record<string, string> = {
      QC_FAILED: 'bg-red-600/20 text-red-400',
    };
    return `px-2 py-0.5 rounded text-[10px] font-medium ${map[status] || 'bg-slate-600/30 text-slate-400'}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-semibold">Harness Rework</h2>
        </div>
        <button onClick={fetchUnits} className="text-slate-400 hover:text-white p-1" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm">Loading...</div>
      ) : units.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-sm">No harness units pending rework</div>
      ) : (
        <div className="space-y-3">
          {orderKeys.map(orderNum => {
            const group = orderGroups[orderNum];
            const isExpanded = expandedOrder === orderNum || orderKeys.length <= 3;
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
                    <span className="bg-red-600/15 text-red-400 px-1.5 py-0.5 rounded text-[10px] font-medium">{group.length} failed</span>
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
                              <span className={badgeCls(unit.status)}>QC FAILED</span>
                            </div>
                            {unit.serialNumber && <p className="text-[10px] text-slate-500 mt-0.5">SN: {unit.serialNumber}</p>}
                            {unit.assignedUser && <p className="text-[10px] text-slate-500">Assigned: {unit.assignedUser.name}</p>}
                            {unit.remarks && <p className="text-[10px] text-red-400 mt-0.5">{unit.remarks}</p>}
                          </div>
                          <div className="flex gap-2 items-center shrink-0">
                            {unit.barcode && (
                              <button
                                onClick={() => window.open(`/print/harness/${unit.id}`, '_blank')}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50"
                                title="Print barcode"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => openQC(unit)}
                              disabled={acting === unit.id}
                              className="px-3 py-1.5 rounded-lg border text-xs font-medium bg-purple-600/20 text-purple-400 border-purple-600/40 hover:bg-purple-600/30 disabled:opacity-40"
                            >
                              Re-test QC
                            </button>
                            <button
                              onClick={() => { setReworkUnitId(unit.id); setReworkRemarks(''); }}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium bg-orange-600/20 text-orange-400 border-orange-600/40 hover:bg-orange-600/30"
                            >
                              <RotateCcw className="w-3 h-3" /> Rework
                            </button>
                          </div>
                        </div>

                        {/* Failed QC report */}
                        {unit.qcData && (
                          <div className="mt-2 p-2 rounded-lg border space-y-1" style={{ background: 'rgba(248,113,113,0.04)', borderColor: 'rgba(248,113,113,0.15)' }}>
                            <p className="text-[10px] text-red-400 font-medium mb-1">Failed Connectors:</p>
                            {Object.entries(unit.qcData).map(([connId, result]) => (
                              <div key={connId} className="flex items-center gap-2 text-xs">
                                {result.status === 'PASS' ? (
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                                ) : (
                                  <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                                )}
                                <span className={result.status === 'PASS' ? 'text-slate-400' : 'text-red-300'}>
                                  {result.name || connId.slice(0, 8)}
                                </span>
                                <span className={`text-[10px] font-medium ${result.status === 'PASS' ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {result.status}
                                </span>
                                {result.remarks && <span className="text-[10px] text-slate-500 italic">— {result.remarks}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Rework dialog */}
                        {reworkUnitId === unit.id && (
                          <div className="mt-3 p-3 rounded-lg bg-smx-bg border border-orange-600/30 space-y-3">
                            <div className="flex items-center gap-2">
                              <RotateCcw className="w-4 h-4 text-orange-400" />
                              <p className="text-xs font-medium text-orange-400">Send to Rework</p>
                            </div>
                            <p className="text-[10px] text-slate-500">
                              This will send <span className="text-sky-300 font-mono">{unit.barcode || 'this harness'}</span> back to crimping. QC data will be cleared.
                            </p>
                            <input
                              className="w-full bg-smx-bg border border-slate-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                              placeholder="Rework reason (optional)..."
                              value={reworkRemarks}
                              onChange={e => setReworkRemarks(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setReworkUnitId(null)} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs hover:bg-slate-600">Cancel</button>
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

                        {/* QC re-test panel */}
                        {qcUnitId === unit.id && (
                          !qcScanVerified ? (
                            <QCScanStep unit={unit} onVerified={v => handleQcScan(unit, v)} onCancel={() => { setQcUnitId(null); setQcScanVerified(false); }} />
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

// ── QC Scan Step ──
function QCScanStep({ unit, onVerified, onCancel }: { unit: HarnessUnit; onVerified: (v: string) => void; onCancel: () => void }) {
  const [scanVal, setScanVal] = useState('');
  const [error, setError] = useState('');
  function handleScan(val: string) {
    const v = val.trim().toUpperCase();
    const match = (unit.barcode && v === unit.barcode.toUpperCase()) || (unit.serialNumber && v === unit.serialNumber.toUpperCase());
    if (match) { onVerified(v); } else { setError('Barcode does not match'); setScanVal(''); }
  }
  return (
    <div className="mt-3 p-3 rounded-lg bg-smx-bg border border-purple-600/30 space-y-3">
      <div className="flex items-center gap-2">
        <ScanLine className="w-4 h-4 text-purple-400" />
        <p className="text-xs font-medium text-purple-400">Scan Barcode to Re-test</p>
      </div>
      <ScanInput value={scanVal} onChange={setScanVal} onScan={handleScan} placeholder="Scan barcode..." autoFocus scannerTitle="Scan Harness" scannerHint="Point at barcode label" />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs hover:bg-slate-600">Cancel</button>
      </div>
    </div>
  );
}

// ── QC Panel ──
function QCPanel({
  connectors, qcResults, setQcResults, onSubmit, onCancel, submitting,
}: {
  connectors: Connector[];
  qcResults: Record<string, { status: 'PASS' | 'FAIL'; remarks: string }>;
  setQcResults: React.Dispatch<React.SetStateAction<Record<string, { status: 'PASS' | 'FAIL'; remarks: string }>>>;
  onSubmit: () => void; onCancel: () => void; submitting: boolean;
}) {
  if (connectors.length === 0) {
    return <div className="mt-3 p-3 rounded-lg bg-smx-bg border border-amber-600/40 text-amber-400 text-xs">No connectors configured.</div>;
  }
  const allPass = Object.values(qcResults).every(r => r.status === 'PASS');
  const failCount = Object.values(qcResults).filter(r => r.status === 'FAIL').length;
  return (
    <div className="mt-3 p-3 rounded-lg bg-smx-bg border border-purple-600/30 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-purple-400" />
        <p className="text-xs font-medium text-purple-400">Re-test QC</p>
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
                <button onClick={() => setQcResults(p => ({ ...p, [c.id]: { ...result, status: 'PASS' } }))}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium border ${result.status === 'PASS' ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/40' : 'bg-slate-700/30 text-slate-500 border-slate-700'}`}>PASS</button>
                <button onClick={() => setQcResults(p => ({ ...p, [c.id]: { ...result, status: 'FAIL' } }))}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium border ${result.status === 'FAIL' ? 'bg-red-600/20 text-red-400 border-red-600/40' : 'bg-slate-700/30 text-slate-500 border-slate-700'}`}>FAIL</button>
              </div>
              {result.status === 'FAIL' && (
                <input className="bg-smx-bg border border-slate-600 rounded px-2 py-1 text-[10px] w-28 focus:outline-none focus:border-red-500"
                  placeholder="Issue..." value={result.remarks}
                  onChange={e => setQcResults(p => ({ ...p, [c.id]: { ...result, remarks: e.target.value } }))} />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between pt-1">
        <div className="text-[10px]">
          {allPass ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> All pass</span>
            : <span className="text-red-400 flex items-center gap-1"><XCircle className="w-3 h-3" /> {failCount} failed</span>}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-lg bg-slate-700 text-slate-200 text-xs hover:bg-slate-600">Cancel</button>
          <button onClick={onSubmit} disabled={submitting}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 ${allPass ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/40' : 'bg-red-600/20 text-red-400 border border-red-600/40'}`}>
            {submitting ? '...' : allPass ? 'Submit QC Pass' : 'Submit QC Fail'}
          </button>
        </div>
      </div>
    </div>
  );
}
