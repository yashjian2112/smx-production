'use client';

import { useState, useEffect, useCallback } from 'react';

const TABS = ['Stock', 'GRN', 'Materials', 'Movements'] as const;
type Tab = typeof TABS[number];

interface RawMaterial {
  id: string; code: string; name: string; unit: string; active: boolean;
  currentStock: number; minimumStock: number; reorderPoint: number;
  category?: { id: string; name: string } | null;
  stockValue?: number; isLowStock?: boolean; isCritical?: boolean; batchCount?: number;
  batches?: Batch[];
}

interface Batch {
  id: string; batchCode: string; quantity: number; remainingQty: number;
  unitPrice: number; condition: string; createdAt: string;
  goodsReceipt?: { grnNumber: string; receivedAt: string } | null;
}

interface GRN {
  id: string; grnNumber: string; receivedAt: string; notes?: string;
  receivedBy: { name: string };
  purchaseOrder: {
    poNumber: string;
    vendor: { name: string; code: string };
    purchaseRequest?: { requestNumber: string } | null;
  };
  items: GRNItem[];
  batches: Batch[];
}

interface GRNItem {
  id: string; quantity: number; unitPrice: number; condition: string;
  rawMaterial: { name: string; unit: string; code: string };
  poItem?: { quantity: number; receivedQuantity: number } | null;
}

interface PurchaseOrder {
  id: string; poNumber: string; status: string;
  vendor: { name: string; code: string };
  purchaseRequest?: { requestNumber: string } | null;
  items: { id: string; rawMaterialId: string; quantity: number; unitPrice: number; receivedQuantity: number; rawMaterial: { name: string; unit: string } }[];
}

interface StockMovement {
  id: string; type: string; quantity: number; reference?: string; notes?: string; createdAt: string;
  rawMaterial: { name: string; code: string; unit: string };
  createdBy: { name: string };
}

interface Category { id: string; name: string; description?: string; _count: { materials: number } }

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtCur = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const map: Record<string, string> = {
    red:    'bg-red-900/30 text-red-400',
    yellow: 'bg-yellow-900/30 text-yellow-400',
    green:  'bg-emerald-900/30 text-emerald-400',
    sky:    'bg-sky-900/30 text-sky-400',
    purple: 'bg-purple-900/30 text-purple-400',
    orange: 'bg-orange-900/30 text-orange-400',
    zinc:   'bg-zinc-800 text-zinc-400',
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[color] ?? map.zinc}`}>{children}</span>;
}

function stockColor(m: RawMaterial) {
  if (m.isCritical) return 'text-red-400';
  if (m.isLowStock) return 'text-yellow-400';
  return 'text-emerald-400';
}

function movementColor(type: string) {
  if (type === 'IN')         return 'green';
  if (type === 'OUT')        return 'red';
  return 'zinc';
}

// ─── Stock Tab ───────────────────────────────────────────────────────────────
function StockTab({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData]         = useState<{ materials: RawMaterial[]; lowStockCount: number; totalValue: number } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<'all' | 'low' | 'critical'>('all');

  // Adjust modal
  const [adjustMat, setAdjustMat]   = useState<RawMaterial | null>(null);
  const [adjType, setAdjType]       = useState<'OPENING' | 'ADJUSTMENT'>('ADJUSTMENT');
  const [adjQty, setAdjQty]         = useState('');
  const [adjReason, setAdjReason]   = useState('');
  const [adjPrice, setAdjPrice]     = useState('');
  const [adjSaving, setAdjSaving]   = useState(false);
  const [adjError, setAdjError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventory/stock');
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = (data?.materials ?? []).filter(m => {
    if (filter === 'low'      && !m.isLowStock) return false;
    if (filter === 'critical' && !m.isCritical) return false;
    const q = search.toLowerCase();
    return !q || m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q) || m.category?.name.toLowerCase().includes(q);
  });

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    setAdjError('');
    setAdjSaving(true);
    const qty = parseFloat(adjQty);
    if (!adjustMat || isNaN(qty) || qty === 0) { setAdjError('Enter a valid non-zero quantity'); setAdjSaving(false); return; }
    const res = await fetch('/api/inventory/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawMaterialId: adjustMat.id, type: adjType, quantity: qty, reason: adjReason, unitPrice: parseFloat(adjPrice || '0') }),
    });
    setAdjSaving(false);
    if (res.ok) { setAdjustMat(null); setAdjQty(''); setAdjReason(''); setAdjPrice(''); load(); }
    else { const e = await res.json(); setAdjError(e.error || 'Failed'); }
  }

  if (loading) return <p className="text-zinc-400 text-sm py-6">Loading stock…</p>;

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-zinc-400 text-xs">Total Materials</p>
          <p className="text-2xl font-bold text-white mt-1">{data?.materials.length ?? 0}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: data?.lowStockCount ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)' }}>
          <p className="text-zinc-400 text-xs">Low Stock</p>
          <p className={`text-2xl font-bold mt-1 ${data?.lowStockCount ? 'text-red-400' : 'text-white'}`}>{data?.lowStockCount ?? 0}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-zinc-400 text-xs">Stock Value</p>
          <p className="text-lg font-bold text-emerald-400 mt-1">{fmtCur(data?.totalValue ?? 0)}</p>
        </div>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search material, code, category…"
          className="flex-1 px-3 py-2 rounded-lg text-sm text-white outline-none border border-zinc-700 focus:border-sky-500"
          style={{ background: 'rgba(255,255,255,0.06)' }} />
        <select value={filter} onChange={e => setFilter(e.target.value as any)}
          className="px-3 py-2 rounded-lg text-sm text-white border border-zinc-700"
          style={{ background: 'rgb(24,24,27)' }}>
          <option value="all">All</option>
          <option value="low">Low Stock</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* Material list */}
      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-zinc-400 text-sm py-4 text-center">No materials found</p>}
        {filtered.map(m => (
          <div key={m.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{m.name}</span>
                    <span className="text-zinc-500 text-xs">{m.code}</span>
                    {m.category && <Badge color="sky">{m.category.name}</Badge>}
                    {m.isCritical  && <Badge color="red">CRITICAL</Badge>}
                    {!m.isCritical && m.isLowStock && <Badge color="yellow">LOW STOCK</Badge>}
                  </div>
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    <span className={`text-lg font-bold ${stockColor(m)}`}>{fmt(m.currentStock)} <span className="text-sm font-normal text-zinc-400">{m.unit}</span></span>
                    <span className="text-zinc-500 text-xs">Reorder: {fmt(m.reorderPoint)} {m.unit}</span>
                    <span className="text-zinc-500 text-xs">Min: {fmt(m.minimumStock)} {m.unit}</span>
                    {m.stockValue !== undefined && <span className="text-zinc-400 text-xs">{fmtCur(m.stockValue)}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {isAdmin && (
                    <button onClick={() => { setAdjustMat(m); setAdjType('ADJUSTMENT'); }}
                      className="px-2 py-1 rounded-lg text-xs text-zinc-300 border border-zinc-700 hover:border-sky-500 hover:text-sky-400 transition-colors">
                      Adjust
                    </button>
                  )}
                  <button onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    className="px-2 py-1 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white transition-colors">
                    {expanded === m.id ? 'Hide' : `Batches (${m.batchCount ?? 0})`}
                  </button>
                </div>
              </div>

              {/* Low-stock Create PR link */}
              {m.isLowStock && (
                <div className="mt-2 pt-2 border-t border-zinc-800">
                  <a href={`/purchase?preMaterial=${m.id}&preQty=${Math.max(0, m.reorderPoint - m.currentStock)}`}
                    className="text-xs text-sky-400 hover:text-sky-300 transition-colors">
                    + Create Purchase Request (shortfall: {fmt(Math.max(0, m.reorderPoint - m.currentStock))} {m.unit})
                  </a>
                </div>
              )}
            </div>

            {/* Batch list */}
            {expanded === m.id && (
              <div className="border-t border-zinc-800 px-4 pb-4">
                {!m.batches || m.batches.length === 0
                  ? <p className="text-zinc-500 text-xs pt-3">No active batches</p>
                  : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-zinc-500 border-b border-zinc-800">
                            <th className="text-left pb-1">Batch</th>
                            <th className="text-right pb-1">Orig</th>
                            <th className="text-right pb-1">Remaining</th>
                            <th className="text-right pb-1">Unit Price</th>
                            <th className="text-left pb-1">GRN</th>
                            <th className="text-left pb-1">Received</th>
                            <th className="text-left pb-1">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.batches.map(b => (
                            <tr key={b.id} className="border-b border-zinc-800/50">
                              <td className="py-1 text-sky-400 font-mono">{b.batchCode}</td>
                              <td className="py-1 text-right text-zinc-300">{fmt(b.quantity)}</td>
                              <td className="py-1 text-right text-emerald-400 font-medium">{fmt(b.remainingQty)}</td>
                              <td className="py-1 text-right text-zinc-400">{fmtCur(b.unitPrice)}</td>
                              <td className="py-1 text-zinc-400">{b.goodsReceipt?.grnNumber ?? '—'}</td>
                              <td className="py-1 text-zinc-400">{b.goodsReceipt ? fmtDate(b.goodsReceipt.receivedAt) : fmtDate(b.createdAt)}</td>
                              <td className="py-1">
                                <a href={`/print/grn-label/${b.id}`} target="_blank"
                                  className="text-purple-400 hover:text-purple-300 transition-colors">Label</a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Adjust Modal */}
      {adjustMat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'rgb(24,24,27)' }}>
            <h3 className="text-white font-semibold mb-4">Stock Adjustment — {adjustMat.name}</h3>
            <form onSubmit={handleAdjust} className="space-y-3">
              <div>
                <label className="text-zinc-400 text-xs">Type</label>
                <select value={adjType} onChange={e => setAdjType(e.target.value as any)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700"
                  style={{ background: 'rgb(39,39,42)' }}>
                  <option value="OPENING">Opening Stock</option>
                  <option value="ADJUSTMENT">Physical Count Adjustment</option>
                </select>
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Quantity ({adjustMat.unit}) — negative to deduct</label>
                <input type="number" step="any" value={adjQty} onChange={e => setAdjQty(e.target.value)} required
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Unit Price (₹) — for opening stock</label>
                <input type="number" step="any" min="0" value={adjPrice} onChange={e => setAdjPrice(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Reason *</label>
                <input value={adjReason} onChange={e => setAdjReason(e.target.value)} required placeholder="e.g. Physical count, Damage write-off…"
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              {adjError && <p className="text-red-400 text-xs">{adjError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setAdjustMat(null)}
                  className="flex-1 py-2 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={adjSaving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50">
                  {adjSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GRN Tab ─────────────────────────────────────────────────────────────────
function GRNTab({ isAdmin }: { isAdmin: boolean }) {
  const [grns, setGrns]           = useState<GRN[]>([]);
  const [pos, setPos]             = useState<PurchaseOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [formItems, setFormItems] = useState<{ poItemId: string; rawMaterialId: string; quantity: string; unitPrice: string; condition: string }[]>([]);
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [grnRes, poRes] = await Promise.all([
      fetch('/api/inventory/grn'),
      fetch('/api/purchase/orders'),
    ]);
    if (grnRes.ok) setGrns(await grnRes.json());
    if (poRes.ok) {
      const allPOs: PurchaseOrder[] = await poRes.json();
      // Only POs that are not fully received
      setPos(allPOs.filter(p => !['RECEIVED', 'CANCELLED'].includes(p.status)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function selectPO(po: PurchaseOrder) {
    setSelectedPO(po);
    setFormItems(po.items.map(i => ({
      poItemId:     i.id,
      rawMaterialId:i.rawMaterialId,
      quantity:     String(Math.max(0, i.quantity - i.receivedQuantity)),
      unitPrice:    String(i.unitPrice),
      condition:    'GOOD',
    })));
    setShowForm(true);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    const res = await fetch('/api/inventory/grn', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        purchaseOrderId: selectedPO!.id,
        notes:           formNotes,
        items:           formItems.map(i => ({
          poItemId:     i.poItemId,
          rawMaterialId:i.rawMaterialId,
          quantity:     parseFloat(i.quantity),
          unitPrice:    parseFloat(i.unitPrice || '0'),
          condition:    i.condition,
        })).filter(i => i.quantity > 0),
      }),
    });
    setSaving(false);
    if (res.ok) { setShowForm(false); setSelectedPO(null); setFormNotes(''); load(); }
    else { const e = await res.json(); setError(e.error || 'Failed to create GRN'); }
  }

  if (loading) return <p className="text-zinc-400 text-sm py-6">Loading…</p>;

  return (
    <div>
      {/* POs eligible for receiving */}
      {isAdmin && pos.length > 0 && (
        <div className="mb-6">
          <h3 className="text-white font-medium mb-3">Pending Goods Receipt</h3>
          <div className="space-y-2">
            {pos.map(po => {
              const unreceived = po.items.some(i => i.receivedQuantity < i.quantity);
              if (!unreceived) return null;
              return (
                <div key={po.id} className="rounded-xl p-4 flex items-center justify-between gap-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{po.poNumber}</span>
                      <Badge color={po.status === 'CONFIRMED' ? 'green' : 'yellow'}>{po.status}</Badge>
                    </div>
                    <p className="text-zinc-400 text-xs mt-0.5">{po.vendor.name} · {po.items.length} item{po.items.length > 1 ? 's' : ''}</p>
                  </div>
                  <button onClick={() => selectPO(po)}
                    className="px-3 py-1.5 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors">
                    Record Receipt
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GRN History */}
      <h3 className="text-white font-medium mb-3">GRN History</h3>
      <div className="space-y-2">
        {grns.length === 0 && <p className="text-zinc-400 text-sm py-4 text-center">No goods receipts yet</p>}
        {grns.map(grn => (
          <div key={grn.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="p-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sky-400 font-mono font-medium">{grn.grnNumber}</span>
                  <span className="text-zinc-500 text-xs">{grn.purchaseOrder.poNumber}</span>
                </div>
                <p className="text-zinc-400 text-xs mt-0.5">
                  {grn.purchaseOrder.vendor.name} · {grn.items.length} item{grn.items.length > 1 ? 's' : ''} · {fmtDate(grn.receivedAt)} · {grn.receivedBy.name}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <a href={`/print/grn-label/${grn.batches[0]?.id}`} target="_blank"
                  className="px-2 py-1 rounded-lg text-xs text-purple-400 border border-purple-800 hover:border-purple-600 transition-colors">
                  Labels
                </a>
                <button onClick={() => setExpanded(expanded === grn.id ? null : grn.id)}
                  className="px-2 py-1 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white transition-colors">
                  {expanded === grn.id ? 'Hide' : 'Details'}
                </button>
              </div>
            </div>
            {expanded === grn.id && (
              <div className="border-t border-zinc-800 px-4 pb-4">
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-800">
                        <th className="text-left pb-1">Material</th>
                        <th className="text-right pb-1">Received</th>
                        <th className="text-right pb-1">Unit Price</th>
                        <th className="text-left pb-1">Condition</th>
                        <th className="text-right pb-1">PO Qty</th>
                        <th className="text-left pb-1">Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grn.items.map((item, idx) => (
                        <tr key={item.id} className="border-b border-zinc-800/40">
                          <td className="py-1 text-white">{item.rawMaterial.name} <span className="text-zinc-500">({item.rawMaterial.unit})</span></td>
                          <td className="py-1 text-right text-emerald-400">{fmt(item.quantity)}</td>
                          <td className="py-1 text-right text-zinc-400">{fmtCur(item.unitPrice)}</td>
                          <td className="py-1">
                            <Badge color={item.condition === 'GOOD' ? 'green' : item.condition === 'DAMAGED' ? 'orange' : 'red'}>{item.condition}</Badge>
                          </td>
                          <td className="py-1 text-right text-zinc-400">{item.poItem ? `${fmt(item.poItem.receivedQuantity)}/${fmt(item.poItem.quantity)}` : '—'}</td>
                          <td className="py-1 text-sky-400 font-mono">{grn.batches[idx]?.batchCode ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {grn.notes && <p className="text-zinc-500 text-xs mt-2">Note: {grn.notes}</p>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* GRN Form Modal */}
      {showForm && selectedPO && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 my-4" style={{ background: 'rgb(24,24,27)' }}>
            <h3 className="text-white font-semibold mb-1">Record Goods Receipt</h3>
            <p className="text-zinc-400 text-sm mb-4">{selectedPO.poNumber} · {selectedPO.vendor.name}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {formItems.map((item, idx) => {
                const poItem = selectedPO.items[idx];
                const pending = poItem ? Math.max(0, poItem.quantity - poItem.receivedQuantity) : 0;
                const received = poItem ? poItem.receivedQuantity : 0;
                return (
                  <div key={item.poItemId} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white text-sm font-medium">{poItem?.rawMaterial.name}</span>
                      <span className="text-zinc-500 text-xs">Already received: {fmt(received)} / {fmt(poItem?.quantity ?? 0)} {poItem?.rawMaterial.unit}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-zinc-400 text-xs">Qty ({poItem?.rawMaterial.unit})</label>
                        <input type="number" step="any" min="0" value={item.quantity}
                          onChange={e => setFormItems(fi => fi.map((f, i) => i === idx ? { ...f, quantity: e.target.value } : f))}
                          className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                          style={{ background: 'rgb(39,39,42)' }} />
                        {pending > 0 && <p className="text-zinc-500 text-xs mt-0.5">Pending: {fmt(pending)}</p>}
                      </div>
                      <div>
                        <label className="text-zinc-400 text-xs">Unit Price (₹)</label>
                        <input type="number" step="any" min="0" value={item.unitPrice}
                          onChange={e => setFormItems(fi => fi.map((f, i) => i === idx ? { ...f, unitPrice: e.target.value } : f))}
                          className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                          style={{ background: 'rgb(39,39,42)' }} />
                      </div>
                      <div>
                        <label className="text-zinc-400 text-xs">Condition</label>
                        <select value={item.condition}
                          onChange={e => setFormItems(fi => fi.map((f, i) => i === idx ? { ...f, condition: e.target.value } : f))}
                          className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm text-white border border-zinc-700"
                          style={{ background: 'rgb(39,39,42)' }}>
                          <option value="GOOD">Good</option>
                          <option value="DAMAGED">Damaged</option>
                          <option value="REJECTED">Rejected</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div>
                <label className="text-zinc-400 text-xs">Notes (optional)</label>
                <textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500 resize-none"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setShowForm(false); setSelectedPO(null); }}
                  className="flex-1 py-2 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50">
                  {saving ? 'Creating GRN…' : 'Create GRN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Materials Tab ────────────────────────────────────────────────────────────
function MaterialsTab({ isAdmin }: { isAdmin: boolean }) {
  const [materials,  setMaterials]  = useState<RawMaterial[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showMatForm,setShowMatForm]= useState(false);
  const [showCatForm,setShowCatForm]= useState(false);
  const [editMat,    setEditMat]    = useState<RawMaterial | null>(null);

  // Form state
  const [fName,  setFName]  = useState('');
  const [fUnit,  setFUnit]  = useState('');
  const [fCatId, setFCatId] = useState('');
  const [fMin,   setFMin]   = useState('0');
  const [fReord, setFReord] = useState('0');
  const [fSaving,setFSaving]= useState(false);
  const [fError, setFError] = useState('');

  const [cName,  setCName]  = useState('');
  const [cDesc,  setCDesc]  = useState('');
  const [cSaving,setCSaving]= useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [mRes, cRes] = await Promise.all([
      fetch('/api/inventory/materials'),
      fetch('/api/inventory/categories'),
    ]);
    if (mRes.ok) setMaterials(await mRes.json());
    if (cRes.ok) setCategories(await cRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNewMat() {
    setEditMat(null); setFName(''); setFUnit(''); setFCatId(''); setFMin('0'); setFReord('0'); setFError('');
    setShowMatForm(true);
  }

  function openEditMat(m: RawMaterial) {
    setEditMat(m); setFName(m.name); setFUnit(m.unit); setFCatId(m.category?.id ?? '');
    setFMin(String(m.minimumStock)); setFReord(String(m.reorderPoint)); setFError('');
    setShowMatForm(true);
  }

  async function handleMatSubmit(e: React.FormEvent) {
    e.preventDefault(); setFError(''); setFSaving(true);
    const body = { name: fName, unit: fUnit, categoryId: fCatId || undefined, minimumStock: parseFloat(fMin), reorderPoint: parseFloat(fReord) };
    const res = editMat
      ? await fetch(`/api/inventory/materials/${editMat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/inventory/materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setFSaving(false);
    if (res.ok) { setShowMatForm(false); load(); }
    else { const e = await res.json(); setFError(e.error || 'Failed'); }
  }

  async function toggleActive(m: RawMaterial) {
    await fetch(`/api/inventory/materials/${m.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !m.active }),
    });
    load();
  }

  async function handleCatSubmit(e: React.FormEvent) {
    e.preventDefault(); setCSaving(true);
    await fetch('/api/inventory/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cName, description: cDesc }) });
    setCSaving(false); setShowCatForm(false); setCName(''); setCDesc(''); load();
  }

  if (loading) return <p className="text-zinc-400 text-sm py-6">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-medium">Raw Materials ({materials.length})</h3>
        {isAdmin && (
          <div className="flex gap-2">
            <button onClick={() => setShowCatForm(true)}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-300 border border-zinc-700 hover:border-sky-500 hover:text-sky-400 transition-colors">
              + Category
            </button>
            <button onClick={openNewMat}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors">
              + Material
            </button>
          </div>
        )}
      </div>

      {/* Categories overview */}
      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {categories.map(c => (
            <span key={c.id} className="px-2 py-1 rounded-lg text-xs" style={{ background: 'rgba(14,165,233,0.1)', color: '#38bdf8' }}>
              {c.name} ({c._count.materials})
            </span>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {materials.map(m => (
          <div key={m.id} className="rounded-xl p-4 flex items-center justify-between gap-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-medium">{m.name}</span>
                <span className="text-zinc-500 text-xs font-mono">{m.code}</span>
                {m.category && <Badge color="sky">{m.category.name}</Badge>}
                {!m.active && <Badge color="zinc">Inactive</Badge>}
              </div>
              <p className="text-zinc-400 text-xs mt-1">
                Unit: {m.unit} · Min: {fmt(m.minimumStock)} · Reorder: {fmt(m.reorderPoint)}
              </p>
            </div>
            {isAdmin && (
              <div className="flex gap-2 shrink-0">
                <button onClick={() => openEditMat(m)}
                  className="px-2 py-1 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white transition-colors">Edit</button>
                <button onClick={() => toggleActive(m)}
                  className={`px-2 py-1 rounded-lg text-xs border transition-colors ${m.active ? 'border-red-800 text-red-400 hover:bg-red-900/20' : 'border-emerald-800 text-emerald-400 hover:bg-emerald-900/20'}`}>
                  {m.active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Material Form Modal */}
      {showMatForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'rgb(24,24,27)' }}>
            <h3 className="text-white font-semibold mb-4">{editMat ? 'Edit Material' : 'New Material'}</h3>
            <form onSubmit={handleMatSubmit} className="space-y-3">
              <div>
                <label className="text-zinc-400 text-xs">Name *</label>
                <input value={fName} onChange={e => setFName(e.target.value)} required
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Unit (pcs, kg, mtrs…) *</label>
                <input value={fUnit} onChange={e => setFUnit(e.target.value)} required
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Category</label>
                <select value={fCatId} onChange={e => setFCatId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700"
                  style={{ background: 'rgb(39,39,42)' }}>
                  <option value="">None</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-zinc-400 text-xs">Min Stock</label>
                  <input type="number" step="any" min="0" value={fMin} onChange={e => setFMin(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                    style={{ background: 'rgb(39,39,42)' }} />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs">Reorder Point</label>
                  <input type="number" step="any" min="0" value={fReord} onChange={e => setFReord(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                    style={{ background: 'rgb(39,39,42)' }} />
                </div>
              </div>
              {fError && <p className="text-red-400 text-xs">{fError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowMatForm(false)}
                  className="flex-1 py-2 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={fSaving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50">
                  {fSaving ? 'Saving…' : editMat ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Form Modal */}
      {showCatForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-xs rounded-2xl p-6" style={{ background: 'rgb(24,24,27)' }}>
            <h3 className="text-white font-semibold mb-4">New Category</h3>
            <form onSubmit={handleCatSubmit} className="space-y-3">
              <div>
                <label className="text-zinc-400 text-xs">Name *</label>
                <input value={cName} onChange={e => setCName(e.target.value)} required
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Description</label>
                <input value={cDesc} onChange={e => setCDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowCatForm(false)}
                  className="flex-1 py-2 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={cSaving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50">
                  {cSaving ? 'Saving…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Movements Tab ────────────────────────────────────────────────────────────
function MovementsTab() {
  const [data,    setData]    = useState<{ movements: StockMovement[]; total: number; totalPages: number }>({ movements: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [typeFilter, setTypeFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (typeFilter) params.set('type', typeFilter);
    const res = await fetch(`/api/inventory/movements?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [page, typeFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-zinc-400 text-sm">{data.total} movements</span>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 rounded-lg text-sm text-white border border-zinc-700"
          style={{ background: 'rgb(24,24,27)' }}>
          <option value="">All Types</option>
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
          <option value="ADJUSTMENT">Adjustment</option>
        </select>
      </div>

      {loading
        ? <p className="text-zinc-400 text-sm py-6">Loading…</p>
        : (
          <div className="space-y-2">
            {data.movements.length === 0 && <p className="text-zinc-400 text-sm py-4 text-center">No movements found</p>}
            {data.movements.map(m => (
              <div key={m.id} className="rounded-xl p-4 flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <div className="shrink-0">
                  <Badge color={movementColor(m.type)}>{m.type}</Badge>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm">{m.rawMaterial.name}</span>
                    <span className="text-zinc-500 text-xs">{m.rawMaterial.code}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {m.reference && <span className="text-zinc-500 text-xs font-mono">{m.reference}</span>}
                    {m.notes && <span className="text-zinc-500 text-xs truncate">{m.notes}</span>}
                    <span className="text-zinc-600 text-xs">{m.createdBy.name}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`font-mono font-medium text-sm ${m.type === 'IN' ? 'text-emerald-400' : m.type === 'OUT' ? 'text-red-400' : 'text-zinc-300'}`}>
                    {m.type === 'OUT' ? '-' : '+'}{fmt(m.quantity)} {m.rawMaterial.unit}
                  </p>
                  <p className="text-zinc-500 text-xs">{fmtDate(m.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors disabled:opacity-30">
            ← Prev
          </button>
          <span className="text-zinc-400 text-sm">Page {page} of {data.totalPages}</span>
          <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages}
            className="px-3 py-1.5 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors disabled:opacity-30">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export default function InventoryPanel({ sessionRole }: { sessionRole: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('Stock');

  // canManageStock: can record GRN, do stock adjustments, create PRs
  const canManageStock     = ['ADMIN', 'PURCHASE_MANAGER', 'STORE_MANAGER'].includes(sessionRole);
  // canManageMaterials: can create/edit/deactivate materials and categories
  const canManageMaterials = ['ADMIN', 'PURCHASE_MANAGER'].includes(sessionRole);

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab ? 'bg-sky-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Stock'     && <StockTab     isAdmin={canManageStock} />}
      {activeTab === 'GRN'       && <GRNTab       isAdmin={canManageStock} />}
      {activeTab === 'Materials' && <MaterialsTab isAdmin={canManageMaterials} />}
      {activeTab === 'Movements' && <MovementsTab />}
    </div>
  );
}
