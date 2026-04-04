'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Check, Clock, Printer, ScanLine } from 'lucide-react';
import { BarcodeScanner } from '@/components/BarcodeScanner';

type UnitSummary = { currentStatus: string; currentStage: string; isTrading?: boolean; productName?: string };

export type OrderItem = {
  id: string;
  orderNumber: string;
  quantity: number;
  status: string;
  createdAt: string;
  voltage?: string | null;
  product: { name: string; code: string; productType?: string };
  client?: { id: string; code: string; customerName: string } | null;
  _count: { units: number };
  units: UnitSummary[];
  hasMyJobCard?: boolean; // true if employee has accepted this order (has a job card)
};

interface AvailableOrder {
  orderId: string;
  orderNumber: string;
  quantity: number;
  dueDate: string | null;
  voltage: string | null;
  product: { id: string; name: string; code: string; productType?: string };
  pendingUnitCount: number;
  stage: string;
  isTrading: boolean;
  alreadyAccepted: boolean;
  myJobCard: { id: string; orderId: string; stage: string; status: string } | null;
}

const STAGE_LABEL: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage',
  BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY: 'Assembly',
  QC_AND_SOFTWARE: 'QC & Software',
  REWORK: 'Rework',
  FINAL_ASSEMBLY: 'Final Assembly',
};

const JC_STATUS: Record<string, { label: ReactNode; color: string }> = {
  PENDING:     { label: <><Clock className="w-4 h-4 mr-1 inline" />Waiting for Materials</>, color: '#fbbf24' },
  DISPATCHED:  { label: <><Check className="w-4 h-4 mr-1 inline" />Materials Dispatched</>,  color: '#4ade80' },
  IN_PROGRESS: { label: '⚙ In Progress',           color: '#38bdf8' },
  COMPLETED:   { label: '✅ Completed',             color: '#4ade80' },
};

export function OrdersList({ orders, isManager, sessionRole }: {
  orders: OrderItem[];
  isManager: boolean;
  sessionRole: string;
}) {
  const router = useRouter();
  const isEmployee = sessionRole === 'PRODUCTION_EMPLOYEE';
  const [tab, setTab] = useState<'pending' | 'processing' | 'completed'>(
    isEmployee ? 'pending' : 'processing'
  );

  // Pending tab state (employee only)
  const [availableOrders, setAvailableOrders] = useState<AvailableOrder[]>([]);
  const [loadingPending, setLoadingPending]   = useState(false);
  const [accepting, setAccepting]             = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    const res = await fetch('/api/production/available-orders');
    if (res.ok) setAvailableOrders(await res.json());
    setLoadingPending(false);
  }, []);

  useEffect(() => {
    if (isEmployee && tab === 'pending') loadPending();
  }, [isEmployee, tab, loadPending]);

  const [acceptError, setAcceptError] = useState('');

  async function acceptOrder(orderId: string, stage: string) {
    setAcceptError('');
    setAccepting(`${orderId}:${stage}`);
    const res = await fetch('/api/inventory/job-cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, stage }),
    });
    setAccepting(null);
    if (res.ok) {
      await loadPending();
    } else {
      const data = await res.json().catch(() => ({ error: 'Failed to accept order' }));
      setAcceptError(data.error || 'Failed to accept order');
    }
  }

  const allUnitsDone = (o: OrderItem) =>
    o.units.length > 0 &&
    o.units.every(u => u.currentStatus === 'COMPLETED' || u.currentStatus === 'APPROVED');

  const processing = orders.filter((o) => {
    if (o.status !== 'ACTIVE') return false;
    if (allUnitsDone(o)) return false;
    // Trading orders always show in Processing (with Accept gate on the card)
    if (o.product.productType === 'TRADING' || o.units.some(u => u.isTrading)) return true;
    // For employees: show in Processing if they accepted the order (have job card)
    if (isEmployee) return o.hasMyJobCard || o.units.some(u => u.currentStatus !== 'PENDING');
    return true;
  });
  const completed = orders.filter((o) => o.status !== 'ACTIVE' || allUnitsDone(o));

  const tabs = isEmployee
    ? [
        { key: 'pending'    as const, label: `Pending (${availableOrders.length})` },
        { key: 'processing' as const, label: `Processing (${processing.length})` },
        { key: 'completed'  as const, label: `Completed (${completed.length})` },
      ]
    : [
        { key: 'processing' as const, label: `Processing (${processing.length})` },
        { key: 'completed'  as const, label: `Completed (${completed.length})` },
      ];

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-4"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t.key ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            style={tab === t.key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.25)' } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Pending tab — employee only */}
      {tab === 'pending' && (
        <div className="space-y-2">
          {acceptError && (
            <div className="p-3 rounded-lg text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {acceptError}
            </div>
          )}
          {loadingPending ? (
            <div className="flex justify-center py-10">
              <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : availableOrders.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm">No pending orders.</p>
              <p className="text-zinc-600 text-xs mt-1">All orders are being processed.</p>
            </div>
          ) : (
            availableOrders.map(order => {
              const key       = `${order.orderId}:${order.stage}`;
              const isLoading = accepting === key;
              const jc        = order.myJobCard;
              const jcInfo    = jc ? JC_STATUS[jc.status] : null;

              return (
                <div key={order.orderId} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm">{order.orderNumber}</span>
                        {jcInfo && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: 'rgba(255,255,255,0.06)', color: jcInfo.color }}>
                            {jcInfo.label}
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-500 text-sm mt-1">
                        {order.product.name}
                        {order.voltage && <span> · {order.voltage}</span>}
                        {' · '}<span className="text-zinc-400">{order.pendingUnitCount} unit{order.pendingUnitCount !== 1 ? 's' : ''} pending</span>
                      </p>
                      {order.dueDate && (
                        <p className="text-zinc-600 text-xs mt-0.5">
                          Due: {new Date(order.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0">
                      {!order.alreadyAccepted ? (
                        <button
                          onClick={() => acceptOrder(order.orderId, order.stage)}
                          disabled={isLoading}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
                          style={{ background: isLoading ? 'rgba(14,165,233,0.3)' : 'rgba(14,165,233,0.8)' }}>
                          {isLoading ? 'Accepting…' : 'Accept Order'}
                        </button>
                      ) : jc?.status === 'DISPATCHED' ? (
                        <Link href={`/orders/${order.orderId}`}
                          className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white text-center block"
                          style={{ background: 'rgba(34,197,94,0.8)' }}>
                          Start Work →
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-600 text-xs">Waiting…</span>
                          {jc?.id && (
                            <a href={`/print/job-card/${jc.id}`} target="_blank" rel="noreferrer"
                              className="text-zinc-500 hover:text-white text-sm px-2 py-1 rounded-lg border border-zinc-800 hover:border-zinc-600 transition-colors"
                              title="Print Job Card"><Printer className="w-4 h-4" /></a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Processing / Completed tabs */}
      {(tab === 'processing' || tab === 'completed') && (
        <div className="space-y-2">
          {(tab === 'processing' ? processing : completed).length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-zinc-500 text-sm">No {tab} orders.</p>
              {isManager && tab === 'processing' && (
                <p className="text-zinc-600 text-xs mt-1">Create a new order to get started.</p>
              )}
            </div>
          ) : (
            (tab === 'processing' ? processing : completed).map((o) => <OrderCard key={o.id} order={o} onRefresh={() => router.refresh()} />)
          )}
        </div>
      )}
    </div>
  );
}

type VerifiedUnit = { id: string; serialNumber: string; barcodeVerified: boolean; currentStatus?: string; product: { name: string } };

function OrderCard({ order, onRefresh }: { order: OrderItem; onRefresh?: () => void }) {
  const [generating, setGenerating] = useState(false);
  const [genDone, setGenDone] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [lastScanned, setLastScanned] = useState('');
  const [acceptingTrading, setAcceptingTrading] = useState(false);
  // DB-sourced verification state
  const [verifiedUnits, setVerifiedUnits] = useState<VerifiedUnit[]>([]);
  const [loadingVerification, setLoadingVerification] = useState(false);

  // Trading units for this order
  const tradingUnits = order.units.filter(u => u.isTrading);
  const tradingCount = tradingUnits.length;
  const tradingAccepted = tradingCount > 0 && tradingUnits.some(u => u.currentStatus !== 'PENDING');
  const tradingAllDone = tradingCount > 0 && tradingUnits.every(u => u.currentStatus === 'COMPLETED' || u.currentStatus === 'APPROVED');
  const verifiedCount = verifiedUnits.filter(u => u.barcodeVerified).length;
  const allVerified = tradingCount > 0 && verifiedCount >= tradingCount;
  const total      = order.quantity;
  const completed  = order.units.filter((u) => u.currentStatus === 'COMPLETED' || u.currentStatus === 'APPROVED').length;
  const inProgress = order.units.filter((u) => u.currentStatus === 'IN_PROGRESS').length;
  const blocked    = order.units.filter((u) => u.currentStatus === 'BLOCKED').length;
  const pct        = total > 0 ? Math.round((completed / total) * 100) : 0;
  const isNew      = Date.now() - new Date(order.createdAt).getTime() < 24 * 60 * 60 * 1000;
  const hasTrading = order.product.productType === 'TRADING' || tradingCount > 0;

  // Fetch verification status from DB (auto-fixes stale data server-side)
  const loadVerification = useCallback(async () => {
    setLoadingVerification(true);
    const res = await fetch(`/api/orders/${order.id}/verify-barcode`);
    if (res.ok) {
      const data: VerifiedUnit[] = await res.json();
      setVerifiedUnits(data);
      // If all verified and auto-fixed, refresh page to update order status
      const allDone = data.length > 0 && data.every(u => u.barcodeVerified);
      if (allDone && !tradingAllDone) onRefresh?.();
    }
    setLoadingVerification(false);
  }, [order.id, tradingAllDone, onRefresh]);

  // Load verification status on mount for trading orders
  useEffect(() => {
    if (hasTrading && tradingAccepted) loadVerification();
  }, [hasTrading, tradingAccepted, loadVerification]);

  return (
    <Link href={`/orders/${order.id}`} className="card-interactive block p-4">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono font-semibold text-sm">{order.orderNumber}</span>
          {isNew && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(56,189,248,0.2)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}>
              NEW
            </span>
          )}
          {hasTrading && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)' }}>
              TRADING
            </span>
          )}
          {blocked > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}>
              {blocked} BLOCKED
            </span>
          )}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${order.status === 'ACTIVE' ? 'text-green-400' : 'text-zinc-500'}`}
          style={order.status === 'ACTIVE'
            ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }
            : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {order.status}
        </span>
      </div>

      <p className="text-zinc-500 text-sm">
        {(() => {
          const grouped: Record<string, number> = {};
          order.units.forEach(u => { const name = u.productName || order.product.name; grouped[name] = (grouped[name] || 0) + 1; });
          const entries = Object.entries(grouped);
          if (entries.length <= 1) {
            const name = entries.length === 1 ? entries[0][0] : order.product.name;
            return <>{name}{order.voltage ? ` · ${order.voltage}` : ''}{' · '}{total} unit{total !== 1 ? 's' : ''}</>;
          }
          return entries.map(([name, count], i) => <span key={name}>{i > 0 ? ' · ' : ''}{count}x {name}</span>);
        })()}
      </p>

      {total > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-zinc-600 mb-1.5">
            <span>{completed} done{inProgress > 0 ? ` · ${inProgress} active` : ''}</span>
            <span className={pct === 100 ? 'text-green-400 font-medium' : ''}>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: pct === 100
                  ? 'linear-gradient(90deg,#22c55e,#16a34a)'
                  : pct > 50
                  ? 'linear-gradient(90deg,#38bdf8,#0ea5e9)'
                  : 'linear-gradient(90deg,#6366f1,#38bdf8)',
              }} />
          </div>
        </div>
      )}

      {hasTrading && (
        <div className="mt-3 pt-2 border-t border-zinc-800/50 flex gap-2 flex-wrap">
          {!tradingAccepted ? (
            <button
              onClick={async (e) => {
                e.preventDefault(); e.stopPropagation();
                setAcceptingTrading(true);
                const res = await fetch(`/api/orders/${order.id}/accept-trading`, { method: 'POST' });
                setAcceptingTrading(false);
                if (res.ok) onRefresh?.();
              }}
              disabled={acceptingTrading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: acceptingTrading ? 'rgba(14,165,233,0.3)' : 'rgba(14,165,233,0.8)' }}>
              {acceptingTrading ? 'Accepting...' : 'Accept Order'}
            </button>
          ) : tradingAllDone ? (
            <span className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-emerald-400">
              <Check className="w-3 h-3" /> Verified — Ready for Dispatch
            </span>
          ) : (
            <>
              <a href={`/print/work-order/${order.id}`} target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-400 border border-amber-700/50 hover:bg-amber-900/20 transition-colors">
                Download WO
              </a>
              {!allVerified && !genDone ? (
                <button
                  onClick={async (e) => {
                    e.preventDefault(); e.stopPropagation();
                    setGenerating(true);
                    const res = await fetch(`/api/orders/${order.id}/generate-barcodes`, { method: 'POST' });
                    setGenerating(false);
                    if (res.ok) { setGenDone(true); await loadVerification(); onRefresh?.(); }
                  }}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 border border-emerald-700/50 hover:bg-emerald-900/20 transition-colors disabled:opacity-50">
                  {generating ? 'Generating...' : 'Generate Barcodes'}
                </button>
              ) : !allVerified ? (
                <>
                  <a href={`/print/order-barcodes/${order.id}`} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-sky-400 border border-sky-700/50 hover:bg-sky-900/20 transition-colors">
                    Print Barcodes
                  </a>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScanMode(true); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-purple-400 border border-purple-700/50 hover:bg-purple-900/20 transition-colors">
                    Scan to Confirm ({verifiedCount}/{tradingCount})
                  </button>
                </>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-emerald-400">
                  <Check className="w-3 h-3" /> Verified — Ready for Dispatch
                </span>
              )}
            </>
          )}
        </div>
      )}

      {/* Scan confirmation modal */}
      {scanMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ background: 'rgb(24,24,27)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold text-sm">Scan Barcodes to Confirm</h3>
              <span className="text-xs px-2 py-0.5 rounded bg-purple-900/30 text-purple-400 font-medium">
                {verifiedCount} / {tradingCount}
              </span>
            </div>

            <div className="w-full h-1.5 rounded-full bg-zinc-800 mb-4">
              <div className="h-full rounded-full bg-purple-500 transition-all duration-300"
                style={{ width: tradingCount > 0 ? `${(verifiedCount / tradingCount) * 100}%` : '0%' }} />
            </div>

            {scanError && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-900/20 border border-red-800/30">
                <p className="text-red-400 text-xs">{scanError}</p>
              </div>
            )}
            {lastScanned && !scanError && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-800/30">
                <p className="text-emerald-400 text-xs"><Check className="w-3 h-3 inline mr-1" />{lastScanned} confirmed</p>
              </div>
            )}

            {loadingVerification ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto mb-4">
                {verifiedUnits.map((u) => (
                  <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg"
                    style={{ background: u.barcodeVerified ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)' }}>
                    <div>
                      <p className="text-xs text-zinc-300 font-mono">{u.serialNumber}</p>
                      <p className="text-[10px] text-zinc-500">{u.product.name}</p>
                    </div>
                    {u.barcodeVerified ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <span className="text-[10px] text-zinc-600">Pending</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              {allVerified ? (
                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScanMode(false); onRefresh?.(); }}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white transition-colors flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" /> All Verified — Done
                </button>
              ) : (
                <>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScanMode(false); }}
                    className="flex-1 py-2 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors">
                    Close
                  </button>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScanError(''); setScanning(true); }}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors flex items-center justify-center gap-1.5">
                    <ScanLine className="w-4 h-4" /> Scan Barcode
                  </button>
                </>
              )}
            </div>
          </div>

          {scanning && (
            <BarcodeScanner
              title="Scan Unit Barcode"
              hint="Scan the printed barcode label"
              onScan={async (code) => {
                setScanning(false);
                setScanError('');
                try {
                  const res = await fetch(`/api/orders/${order.id}/verify-barcode`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ barcode: code }),
                  });
                  const data = await res.json();
                  if (!res.ok) { setScanError(data.error || 'Verification failed'); return; }
                  if (data.alreadyVerified) { setScanError('Already verified'); return; }
                  setLastScanned(code);
                  await loadVerification(); // refresh from DB
                  if (data.allVerified) onRefresh?.(); // refresh order data
                } catch {
                  setScanError('Network error — try again');
                }
              }}
              onClose={() => setScanning(false)}
            />
          )}
        </div>
      )}
    </Link>
  );
}
