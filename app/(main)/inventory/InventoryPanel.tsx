'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, X, Package, ScanLine, ArrowLeft } from 'lucide-react';

const TABS = ['Materials', 'GRN', 'Job Cards', 'Rework', 'Reports', 'Settings'] as const;
type Tab = typeof TABS[number];

interface MaterialVariant { id: string; name: string; barcode: string; currentStock: number; }

interface RawMaterial {
  id: string; code: string; barcode?: string | null; name: string; unit: string; active: boolean;
  purchaseUnit?: string | null; conversionFactor?: number | null;
  description?: string | null; hsnCode?: string | null;
  purchasePrice?: number; leadTimeDays?: number;
  currentStock: number; minimumStock: number; reorderPoint: number; minimumOrderQty?: number;
  committedStock?: number; availableStock?: number;
  category?: { id: string; name: string } | null;
  preferredVendor?: { id: string; name: string } | null;
  variants?: MaterialVariant[];
  stockValue?: number; isLowStock?: boolean; isCritical?: boolean; batchCount?: number;
  batches?: Batch[];
}

interface Batch {
  id: string; batchCode: string; quantity: number; remainingQty: number;
  unitPrice: number; condition: string; createdAt: string;
  expiryDate?: string | null; manufacturingDate?: string | null;
  goodsReceipt?: { grnNumber: string; receivedAt: string } | null;
}

interface Vendor { id: string; name: string; code: string; }

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
  materialSerials?: {
    id: string;
    barcode: string;
    stageType: string;
    status: string; // PRINTED | CONFIRMED | ALLOCATED | CONSUMED
    material: { name: string; code: string };
  }[];
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
  id: string; type: string; quantity: number; reference?: string; notes?: string; adjustmentType?: string; createdAt: string;
  rawMaterial: { name: string; code: string; unit: string };
  createdBy: { name: string };
}

interface Category { id: string; name: string; code: string; description?: string; _count: { materials: number } }

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
function StockTab({ isAdmin, onSwitchTab }: { isAdmin: boolean; onSwitchTab: (tab: Tab) => void }) {
  const [data, setData]         = useState<{ materials: RawMaterial[]; lowStockCount: number; totalValue: number } | null>(null);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<'all' | 'low' | 'critical'>('all');

  // Add Stock modal
  const [addMat, setAddMat]               = useState<RawMaterial | null>(null);
  const [addType, setAddType]             = useState<'OPENING' | 'ADJUSTMENT'>('OPENING');
  const [addMode, setAddMode]             = useState<'add' | 'physical' | 'adjustment'>('add');
  const [addQty, setAddQty]               = useState('');
  const [addPrice, setAddPrice]           = useState('');
  const [addNotes, setAddNotes]           = useState('');
  const [addAdjType, setAddAdjType]       = useState('DAMAGE'); // for adjustment mode
  const [addAdjSign, setAddAdjSign]       = useState<1 | -1>(1); // +1 or -1
  const [addExpiryDate, setAddExpiryDate] = useState('');
  const [addSaving, setAddSaving]         = useState(false);
  const [addError, setAddError]           = useState('');
  const [reorderBusy, setReorderBusy]     = useState(false);
  const [reorderMsg, setReorderMsg]       = useState('');
  const [printBatchId, setPrintBatchId]   = useState<string | null>(null);

  // Issue Stock modal
  const [issueMat, setIssueMat]       = useState<RawMaterial | null>(null);
  const [issueQty, setIssueQty]       = useState('');
  const [issuePurpose, setIssuePurpose] = useState('PRODUCTION');
  const [issueNotes, setIssueNotes]   = useState('');
  const [issueSaving, setIssueSaving] = useState(false);
  const [issueError, setIssueError]   = useState('');

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

  const lowStockItems = (data?.materials ?? []).filter(m => m.isLowStock && m.reorderPoint > 0);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddSaving(true);
    const inputQty = parseFloat(addQty);
    if (!addMat || isNaN(inputQty) || inputQty < 0) { setAddError('Enter a valid quantity'); setAddSaving(false); return; }
    const discreteUnits = ['pcs', 'pieces', 'units', 'nos', 'pc'];
    if (discreteUnits.includes(addMat.unit?.toLowerCase()) && !Number.isInteger(inputQty)) {
      setAddError('Quantity must be a whole number for this unit type');
      setAddSaving(false);
      return;
    }
    let qty: number;
    let adjustmentType: string | undefined;
    if (addMode === 'physical') {
      qty = inputQty - addMat.currentStock;
      adjustmentType = 'PHYSICAL_COUNT';
    } else if (addMode === 'adjustment') {
      qty = inputQty * addAdjSign;
      adjustmentType = addAdjType;
    } else {
      qty = inputQty;
      adjustmentType = undefined;
    }
    if (addMode === 'add' && qty <= 0) { setAddError('Quantity must be greater than 0'); setAddSaving(false); return; }
    const res = await fetch('/api/inventory/adjust', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawMaterialId:  addMat.id,
        type:           'ADJUSTMENT',
        adjustmentType,
        quantity:       qty,
        reason:         addNotes || (addMode === 'physical' ? 'Physical stock count' : addMode === 'adjustment' ? addAdjType : 'Manual addition'),
        unitPrice:      parseFloat(addPrice || '0'),
        expiryDate:     addExpiryDate || undefined,
      }),
    });
    setAddSaving(false);
    if (res.ok) {
      const data = await res.json();
      setAddMat(null); setAddQty(''); setAddNotes(''); setAddPrice(''); setAddExpiryDate('');
      load();
      if (addMode === 'add' && data.batchId) setPrintBatchId(data.batchId);
    } else { const e = await res.json(); setAddError(e.error || 'Failed'); }
  }

  async function handleCreateAllPRs() {
    setReorderBusy(true); setReorderMsg('');
    const res = await fetch('/api/inventory/reorder-prs', { method: 'POST' });
    setReorderBusy(false);
    const data = await res.json();
    if (res.ok) setReorderMsg(`Created ${data.created} PR${data.created !== 1 ? 's' : ''}`);
    else setReorderMsg('Failed to create PRs');
    setTimeout(() => setReorderMsg(''), 4000);
  }

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    setIssueError('');
    setIssueSaving(true);
    const qty = parseFloat(issueQty);
    if (!issueMat || isNaN(qty) || qty <= 0) { setIssueError('Enter a valid positive quantity'); setIssueSaving(false); return; }
    const res = await fetch('/api/inventory/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawMaterialId: issueMat.id, quantity: qty, purpose: issuePurpose, notes: issueNotes }),
    });
    setIssueSaving(false);
    if (res.ok) { setIssueMat(null); setIssueQty(''); setIssueNotes(''); load(); }
    else { const e = await res.json(); setIssueError(e.error || 'Failed'); }
  }

  if (loading) return <p className="text-zinc-400 text-sm py-6">Loading stock…</p>;

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <p className="text-zinc-400 text-xs">Total Materials</p>
          <p className="text-2xl font-bold text-white mt-1">{data?.materials.length ?? 0}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: data?.lowStockCount ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)' }}>
          <p className="text-zinc-400 text-xs">Low Stock</p>
          <p className={`text-2xl font-bold mt-1 ${data?.lowStockCount ? 'text-red-400' : 'text-white'}`}>{data?.lowStockCount ?? 0}</p>
        </div>
      </div>

      {/* Reorder Alerts Panel */}
      {lowStockItems.length > 0 && (
        <div className="mb-5 rounded-xl border border-red-900/40 overflow-hidden" style={{ background: 'rgba(239,68,68,0.06)' }}>
          <div className="px-4 py-3 border-b border-red-900/30 flex items-center justify-between gap-3">
            <span className="text-red-400 text-sm font-medium">⚠ Reorder Alerts ({lowStockItems.length})</span>
            <div className="flex items-center gap-2">
              {reorderMsg && <span className="inline-flex items-center text-xs text-emerald-400"><Check className="w-4 h-4 mr-1 inline" />{reorderMsg}</span>}
              {isAdmin && (
                <button onClick={handleCreateAllPRs} disabled={reorderBusy}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-sky-700 hover:bg-sky-600 text-white transition-colors disabled:opacity-50">
                  {reorderBusy ? 'Creating…' : 'Create All PRs'}
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-red-900/20">
            {lowStockItems.map(m => (
              <div key={m.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{m.name}</p>
                  <p className="text-xs mt-0.5">
                    <span className={m.isCritical ? 'text-red-400' : 'text-yellow-400'}>
                      {fmt(m.currentStock)} {m.unit} in stock
                    </span>
                    <span className="text-zinc-500"> · Reorder at {fmt(m.reorderPoint)} {m.unit}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && (
                    <button onClick={() => { setAddMat(m); setAddType('OPENING'); setAddQty(''); setAddNotes(''); setAddPrice(''); }}
                      className="px-2 py-1 rounded-lg text-xs font-medium bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/30 transition-colors">
                      + Add Stock
                    </button>
                  )}
                  <a href={`/purchase?preMaterial=${m.id}&preQty=${Math.max(0, m.reorderPoint - m.currentStock)}`}
                    className="px-2 py-1 rounded-lg text-xs font-medium bg-sky-600/20 text-sky-400 border border-sky-600/30 hover:bg-sky-600/30 transition-colors">
                    Create PR
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
      {data?.materials.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-zinc-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="mb-4"><Package className="w-4 h-4" /></div>
          <h3 className="text-white text-lg font-semibold mb-2">No materials yet</h3>
          <p className="text-zinc-400 text-sm mb-6 max-w-xs">
            Start by creating your raw materials in the Materials tab, then add opening stock here.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={() => onSwitchTab('Materials')}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors">
              + Add New Material
            </button>
            <button onClick={() => onSwitchTab('GRN')}
              className="px-5 py-2.5 rounded-xl text-sm font-medium border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition-colors">
              Record Stock Receipt
            </button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        {data?.materials.length !== 0 && filtered.length === 0 && <p className="text-zinc-400 text-sm py-4 text-center">No materials match your search</p>}
        {filtered.map(m => (
          <div key={m.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium">{m.name}</span>
                    <span className="text-zinc-500 text-xs font-mono">{m.barcode ?? m.code}</span>
                    {m.category && <Badge color="sky">{m.category.name}</Badge>}
                    {m.isCritical  && <Badge color="red">CRITICAL</Badge>}
                    {!m.isCritical && m.isLowStock && <Badge color="yellow">LOW STOCK</Badge>}
                  </div>
                  <div className="flex items-center gap-4 mt-2 flex-wrap">
                    <span className={`text-lg font-bold ${stockColor(m)}`}>{fmt(m.currentStock)} <span className="text-sm font-normal text-zinc-400">{m.unit}</span></span>
                    <span className="text-zinc-500 text-xs">Reorder: {fmt(m.reorderPoint)} {m.unit}</span>
                    <span className="text-zinc-500 text-xs">Min: {fmt(m.minimumStock)} {m.unit}</span>
                    {m.stockValue !== undefined && m.stockValue > 0 && <span className="text-zinc-400 text-xs">{fmtCur(m.stockValue)}</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                  {isAdmin && (
                    <>
                      <button onClick={() => { setAddMat(m); setAddType('OPENING'); setAddMode('add'); setAddQty(''); setAddNotes(''); setAddPrice(''); }}
                        className="px-2 py-1 rounded-lg text-xs font-medium text-emerald-400 border border-emerald-700/50 hover:bg-emerald-700/20 transition-colors">
                        + Add
                      </button>
                      <button onClick={() => { setAddMat(m); setAddType('ADJUSTMENT'); setAddMode('adjustment'); setAddQty(''); setAddNotes(''); setAddPrice(''); setAddAdjSign(-1); }}
                        className="px-2 py-1 rounded-lg text-xs font-medium text-amber-400 border border-amber-700/50 hover:bg-amber-700/20 transition-colors">
                        ± Adjust
                      </button>
                      <button onClick={() => { setIssueMat(m); setIssueQty(''); setIssueNotes(''); setIssuePurpose('PRODUCTION'); }}
                        className="px-2 py-1 rounded-lg text-xs font-medium text-orange-400 border border-orange-700/50 hover:bg-orange-700/20 transition-colors"
                        disabled={m.currentStock <= 0}>
                        Issue
                      </button>
                    </>
                  )}
                  <button onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                    className="px-2 py-1 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white transition-colors">
                    {expanded === m.id ? 'Hide' : `Batches (${m.batchCount ?? 0})`}
                  </button>
                </div>
              </div>
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
                            <th className="text-left pb-1">Expiry</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.batches.map(b => {
                            const now = new Date();
                            const expiry = b.expiryDate ? new Date(b.expiryDate) : null;
                            const isExpired = expiry && expiry < now;
                            const isExpiringSoon = expiry && !isExpired && expiry <= new Date(now.getTime() + 30*24*60*60*1000);
                            return (
                            <tr key={b.id} className="border-b border-zinc-800/50">
                              <td className="py-1 text-zinc-400 font-mono">{b.batchCode}</td>
                              <td className="py-1 text-right text-zinc-300">{fmt(b.quantity)}</td>
                              <td className="py-1 text-right text-emerald-400 font-medium">{fmt(b.remainingQty)}</td>
                              <td className="py-1 text-right text-zinc-400">{fmtCur(b.unitPrice)}</td>
                              <td className="py-1 text-zinc-400">{b.goodsReceipt?.grnNumber ?? '—'}</td>
                              <td className="py-1 text-zinc-400">{b.goodsReceipt ? fmtDate(b.goodsReceipt.receivedAt) : fmtDate(b.createdAt)}</td>
                              <td className="py-1">
                                {isExpired ? <Badge color="red">EXPIRED</Badge>
                                  : isExpiringSoon ? <Badge color="yellow">{fmtDate(b.expiryDate!)}</Badge>
                                  : expiry ? <span className="text-zinc-400">{fmtDate(b.expiryDate!)}</span>
                                  : <span className="text-zinc-600">—</span>}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Stock / Physical Count / Adjustment Modal */}
      {addMat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'rgb(24,24,27)' }}>
            <h3 className="text-white font-semibold mb-1">
              {addMode === 'physical' ? 'Physical Count' : addMode === 'adjustment' ? 'Inventory Adjustment' : 'Add Stock'}
            </h3>
            <p className="text-zinc-400 text-xs mb-3">{addMat.name} · Current: <span className="text-white font-medium">{fmt(addMat.currentStock)}</span> {addMat.unit}</p>
            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-zinc-700 mb-4 text-xs">
              <button type="button" onClick={() => { setAddMode('add'); setAddQty(''); }}
                className={`flex-1 py-2 transition-colors ${addMode === 'add' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                + Add Stock
              </button>
              <button type="button" onClick={() => { setAddMode('adjustment'); setAddQty(''); setAddAdjSign(-1); }}
                className={`flex-1 py-2 transition-colors ${addMode === 'adjustment' ? 'bg-orange-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                Adjustment
              </button>
              <button type="button" onClick={() => { setAddMode('physical'); setAddQty(String(addMat.currentStock)); }}
                className={`flex-1 py-2 transition-colors ${addMode === 'physical' ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
                Physical Count
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              {addMode === 'adjustment' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-zinc-400 text-xs">Reason</label>
                    <select value={addAdjType} onChange={e => {
                      setAddAdjType(e.target.value);
                      // FOUND is positive, others negative by default
                      setAddAdjSign(e.target.value === 'FOUND' || e.target.value === 'CORRECTION' ? 1 : -1);
                    }}
                      className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700"
                      style={{ background: 'rgb(39,39,42)' }}>
                      <option value="DAMAGE">Damage Write-off</option>
                      <option value="THEFT">Theft / Loss</option>
                      <option value="EXPIRY">Expiry Write-off</option>
                      <option value="FOUND">Found / Excess</option>
                      <option value="CORRECTION">Stock Correction</option>
                    </select>
                  </div>
                  {(addAdjType === 'FOUND' || addAdjType === 'CORRECTION') && (
                    <div className="flex rounded-lg overflow-hidden border border-zinc-700 text-xs">
                      <button type="button" onClick={() => setAddAdjSign(1)}
                        className={`flex-1 py-1.5 transition-colors ${addAdjSign === 1 ? 'bg-emerald-700 text-white' : 'text-zinc-400'}`}>
                        + Add
                      </button>
                      <button type="button" onClick={() => setAddAdjSign(-1)}
                        className={`flex-1 py-1.5 transition-colors ${addAdjSign === -1 ? 'bg-red-700 text-white' : 'text-zinc-400'}`}>
                        − Deduct
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="text-zinc-400 text-xs">
                  {addMode === 'physical' ? `Actual counted quantity (${addMat.unit})` : `Quantity (${addMat.unit})`}
                </label>
                <input type="number" step="any" min="0" value={addQty} onChange={e => setAddQty(e.target.value)} required
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                  style={{ background: 'rgb(39,39,42)' }} placeholder="0" />
                {addMode === 'physical' && addQty !== '' && (
                  <p className="text-xs mt-1">
                    {parseFloat(addQty) > addMat.currentStock
                      ? <span className="text-emerald-400">+{fmt(parseFloat(addQty) - addMat.currentStock)} {addMat.unit} will be added</span>
                      : parseFloat(addQty) < addMat.currentStock
                      ? <span className="text-red-400">−{fmt(addMat.currentStock - parseFloat(addQty))} {addMat.unit} will be deducted</span>
                      : <span className="text-zinc-400">No change</span>}
                  </p>
                )}
                {addMode === 'adjustment' && addQty !== '' && parseFloat(addQty) > 0 && (
                  <p className="text-xs mt-1 text-orange-300">
                    {addAdjSign > 0 ? '+' : '−'}{fmt(parseFloat(addQty))} {addMat.unit} adjustment
                  </p>
                )}
              </div>
              {addMode === 'add' && (
                <>
                  <div>
                    <label className="text-zinc-400 text-xs">Unit Price ₹ (optional)</label>
                    <input type="number" step="any" min="0" value={addPrice} onChange={e => setAddPrice(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                      style={{ background: 'rgb(39,39,42)' }} placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-zinc-400 text-xs">Expiry Date (optional)</label>
                    <input type="date" value={addExpiryDate} onChange={e => setAddExpiryDate(e.target.value)}
                      className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                      style={{ background: 'rgb(39,39,42)' }} />
                  </div>
                </>
              )}
              <div>
                <label className="text-zinc-400 text-xs">Notes {(addMode === 'add' || addMode === 'adjustment') && '*'}</label>
                <input value={addNotes} onChange={e => setAddNotes(e.target.value)} required={addMode !== 'physical'}
                  placeholder={addMode === 'physical' ? 'e.g. Annual stock count…' : addMode === 'adjustment' ? 'e.g. Found during audit, Damaged in storage…' : 'e.g. Cash purchase, Returned from production…'}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              {addError && <p className="text-red-400 text-xs">{addError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setAddMat(null)}
                  className="flex-1 py-2 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={addSaving}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 ${addMode === 'physical' ? 'bg-sky-600 hover:bg-sky-500' : addMode === 'adjustment' ? 'bg-orange-600 hover:bg-orange-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                  {addSaving ? 'Saving…' : addMode === 'physical' ? 'Save Count' : addMode === 'adjustment' ? 'Apply Adjustment' : 'Add Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Print Label after Add Stock */}
      {printBatchId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: 'rgb(24,24,27)' }}>
            <div className="text-4xl mb-3">🏷️</div>
            <h3 className="text-white font-semibold mb-1">Stock Added</h3>
            <p className="text-zinc-400 text-sm mb-5">Do you want to print the barcode label for this batch?</p>
            <div className="flex gap-3">
              <button onClick={() => setPrintBatchId(null)}
                className="flex-1 py-2 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors">
                Skip
              </button>
              <a href={`/print/grn-label/${printBatchId}`} target="_blank"
                onClick={() => setPrintBatchId(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-700 hover:bg-purple-600 text-white transition-colors text-center">
                Print Label
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Issue Stock Modal */}
      {issueMat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6" style={{ background: 'rgb(24,24,27)' }}>
            <h3 className="text-white font-semibold mb-1">Issue / Consume Stock</h3>
            <p className="text-zinc-400 text-xs mb-4">{issueMat.name} · Available: {fmt(issueMat.currentStock)} {issueMat.unit}</p>
            <form onSubmit={handleIssue} className="space-y-3">
              <div>
                <label className="text-zinc-400 text-xs">Purpose</label>
                <select value={issuePurpose} onChange={e => setIssuePurpose(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700"
                  style={{ background: 'rgb(39,39,42)' }}>
                  <option value="PRODUCTION">Production / Assembly</option>
                  <option value="SCRAP">Scrap / Waste</option>
                  <option value="SAMPLE">Sample / Testing</option>
                  <option value="DAMAGE">Damage Write-off</option>
                  <option value="RETURN_TO_VENDOR">Return to Vendor</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Quantity to Issue ({issueMat.unit})</label>
                <input type="number" step="any" min="0.01" max={issueMat.currentStock} value={issueQty} onChange={e => setIssueQty(e.target.value)} required
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-orange-500"
                  style={{ background: 'rgb(39,39,42)' }} placeholder="0" />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Notes / Reference *</label>
                <input value={issueNotes} onChange={e => setIssueNotes(e.target.value)} required
                  placeholder="e.g. Order #ORD-001, Batch damaged in storage…"
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-orange-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              {issueError && <p className="text-red-400 text-xs">{issueError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setIssueMat(null)}
                  className="flex-1 py-2 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={issueSaving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors disabled:opacity-50">
                  {issueSaving ? 'Issuing…' : 'Issue Stock'}
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

  // Direct Receipt (without PO)
  const [showDirect, setShowDirect]   = useState(false);
  const [allMats, setAllMats]         = useState<{ id: string; name: string; unit: string; code: string }[]>([]);
  const [drSupplier, setDrSupplier]   = useState('');
  const [drInvoice, setDrInvoice]     = useState('');
  const [drNotes, setDrNotes]         = useState('');
  const [drItems, setDrItems]         = useState<{ rawMaterialId: string; quantity: string; unitPrice: string }[]>([{ rawMaterialId: '', quantity: '', unitPrice: '' }]);
  const [drSaving, setDrSaving]       = useState(false);
  const [drError, setDrError]         = useState('');

  // Serial scan state
  const [scanningGRN, setScanningGRN] = useState<GRN | null>(null);
  const [scanBarcode, setScanBarcode] = useState('');
  const [scanResult, setScanResult]   = useState<{ ok: boolean; message: string } | null>(null);
  const [scanSaving, setScanSaving]   = useState(false);
  const [grnSerials, setGrnSerials]   = useState<Record<string, { id: string; barcode: string; stageType: string; status: string; material: { name: string; code: string } }[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [grnRes, poRes, matRes] = await Promise.all([
      fetch('/api/inventory/grn'),
      fetch('/api/purchase/orders'),
      fetch('/api/inventory/materials'),
    ]);
    if (grnRes.ok) setGrns(await grnRes.json());
    if (poRes.ok) {
      const allPOs: PurchaseOrder[] = await poRes.json();
      setPos(allPOs.filter(p => !['RECEIVED', 'CANCELLED'].includes(p.status)));
    }
    if (matRes.ok) setAllMats(await matRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadSerials(grnId: string) {
    const r = await fetch(`/api/procurement/material-serials?grnId=${grnId}`);
    if (r.ok) {
      const data = await r.json();
      setGrnSerials(prev => ({ ...prev, [grnId]: data }));
    }
  }

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!scanBarcode.trim()) return;
    setScanSaving(true);
    setScanResult(null);
    const r = await fetch('/api/procurement/material-serials/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode: scanBarcode.trim().toUpperCase() }),
    });
    const data = await r.json();
    if (r.ok) {
      setScanResult({ ok: true, message: data.alreadyConfirmed ? `Already confirmed: ${scanBarcode}` : `Confirmed: ${scanBarcode} (${data.material?.name ?? ''})` });
      setScanBarcode('');
      if (scanningGRN) loadSerials(scanningGRN.id);
    } else {
      setScanResult({ ok: false, message: data.error || 'Scan failed' });
    }
    setScanSaving(false);
  }

  async function handleDirectSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDrError(''); setDrSaving(true);
    const items = drItems.filter(i => i.rawMaterialId && parseFloat(i.quantity) > 0)
      .map(i => ({ rawMaterialId: i.rawMaterialId, quantity: parseFloat(i.quantity), unitPrice: parseFloat(i.unitPrice || '0') }));
    if (items.length === 0) { setDrError('Add at least one item with quantity'); setDrSaving(false); return; }
    const res = await fetch('/api/inventory/direct-receipt', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier: drSupplier || undefined, invoiceRef: drInvoice || undefined, notes: drNotes || undefined, items }),
    });
    setDrSaving(false);
    if (res.ok) { setShowDirect(false); setDrSupplier(''); setDrInvoice(''); setDrNotes(''); setDrItems([{ rawMaterialId: '', quantity: '', unitPrice: '' }]); load(); }
    else { const e = await res.json(); setDrError(e.error || 'Failed'); }
  }

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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-medium">GRN History</h3>
        {isAdmin && (
          <button onClick={() => { setShowDirect(true); setDrError(''); }}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white transition-colors">
            + Direct Receipt
          </button>
        )}
      </div>
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
                {/* MaterialSerial section */}
                {(() => {
                  const serials = grnSerials[grn.id];
                  if (serials === undefined) {
                    // Not loaded yet — show load button
                    return (
                      <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-2">
                        <button onClick={() => loadSerials(grn.id)}
                          className="px-3 py-1.5 rounded-lg text-xs text-sky-400 border border-sky-900 hover:border-sky-600 transition-colors">
                          Check Unit Barcodes
                        </button>
                      </div>
                    );
                  }
                  if (serials.length === 0) return null;
                  const confirmed = serials.filter(s => s.status !== 'PRINTED').length;
                  const total = serials.length;
                  return (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-zinc-300 text-xs font-medium">Unit Barcodes</span>
                          <span className={`ml-2 text-xs font-medium ${confirmed === total ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {confirmed}/{total} confirmed
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <a href={`/print/grn-serials/${grn.id}`} target="_blank" rel="noreferrer"
                            className="px-3 py-1 rounded-lg text-xs text-zinc-300 border border-zinc-700 hover:text-white transition-colors">
                            Print Labels
                          </a>
                          {confirmed < total && (
                            <button onClick={() => { setScanningGRN(grn); setScanBarcode(''); setScanResult(null); }}
                              className="px-3 py-1 rounded-lg text-xs font-medium bg-sky-700 hover:bg-sky-600 text-white transition-colors">
                              Scan & Confirm
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {serials.map(s => (
                          <span key={s.id} className={`px-2 py-0.5 rounded text-xs font-mono ${
                            s.status === 'PRINTED' ? 'bg-zinc-800 text-zinc-400' :
                            s.status === 'CONFIRMED' ? 'bg-emerald-900/40 text-emerald-400' :
                            s.status === 'ALLOCATED' ? 'bg-sky-900/40 text-sky-400' :
                            'bg-purple-900/40 text-purple-400'
                          }`} title={s.status}>
                            {s.barcode}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Direct Receipt Modal */}
      {showDirect && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-lg rounded-2xl p-6 my-4" style={{ background: 'rgb(24,24,27)' }}>
            <h3 className="text-white font-semibold mb-4">Direct Receipt (without PO)</h3>
            <form onSubmit={handleDirectSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 text-xs">Supplier / Vendor</label>
                  <input value={drSupplier} onChange={e => setDrSupplier(e.target.value)}
                    placeholder="e.g. ABC Traders"
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                    style={{ background: 'rgb(39,39,42)' }} />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs">Invoice / Bill Ref</label>
                  <input value={drInvoice} onChange={e => setDrInvoice(e.target.value)}
                    placeholder="e.g. INV-2024-001"
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                    style={{ background: 'rgb(39,39,42)' }} />
                </div>
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Notes (optional)</label>
                <input value={drNotes} onChange={e => setDrNotes(e.target.value)}
                  placeholder="e.g. Cash purchase, sample received…"
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-zinc-400 text-xs">Items</label>
                  <button type="button"
                    onClick={() => setDrItems(prev => [...prev, { rawMaterialId: '', quantity: '', unitPrice: '' }])}
                    className="text-xs text-sky-400 hover:text-sky-300">+ Add row</button>
                </div>
                <div className="space-y-2">
                  {drItems.map((item, idx) => {
                    const mat = allMats.find(m => m.id === item.rawMaterialId);
                    return (
                      <div key={idx} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="col-span-3">
                            <select value={item.rawMaterialId}
                              onChange={e => setDrItems(prev => prev.map((r, i) => i === idx ? { ...r, rawMaterialId: e.target.value } : r))}
                              className="w-full px-2 py-1.5 rounded-lg text-sm text-white border border-zinc-700"
                              style={{ background: 'rgb(39,39,42)' }}>
                              <option value="">— Select material —</option>
                              {allMats.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-zinc-500 text-xs">Qty {mat ? `(${mat.unit})` : ''}</label>
                            <input type="number" step="any" min="0.01" value={item.quantity}
                              onChange={e => setDrItems(prev => prev.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="0"
                              className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                              style={{ background: 'rgb(39,39,42)' }} />
                          </div>
                          <div>
                            <label className="text-zinc-500 text-xs">Unit Price (₹)</label>
                            <input type="number" step="any" min="0" value={item.unitPrice}
                              onChange={e => setDrItems(prev => prev.map((r, i) => i === idx ? { ...r, unitPrice: e.target.value } : r))}
                              onWheel={(e) => e.currentTarget.blur()}
                              placeholder="0"
                              className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                              style={{ background: 'rgb(39,39,42)' }} />
                          </div>
                          <div className="flex items-end">
                            {drItems.length > 1 && (
                              <button type="button" onClick={() => setDrItems(prev => prev.filter((_, i) => i !== idx))}
                                className="w-full py-1.5 rounded-lg text-xs text-red-400 border border-red-900 hover:border-red-600 transition-colors">
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {drError && <p className="text-red-400 text-xs">{drError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowDirect(false)}
                  className="flex-1 py-2 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={drSaving}
                  className="flex-1 py-2 rounded-lg text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white transition-colors disabled:opacity-50">
                  {drSaving ? 'Saving…' : 'Receive Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full mt-1 px-2 py-1.5 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                          style={{ background: 'rgb(39,39,42)' }} />
                        {pending > 0 && <p className="text-zinc-500 text-xs mt-0.5">Pending: {fmt(pending)}</p>}
                      </div>
                      <div>
                        <label className="text-zinc-400 text-xs">Unit Price (₹)</label>
                        <input type="number" step="any" min="0" value={item.unitPrice}
                          onChange={e => setFormItems(fi => fi.map((f, i) => i === idx ? { ...f, unitPrice: e.target.value } : f))}
                          onWheel={(e) => e.currentTarget.blur()}
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

      {/* Scan Confirmation Modal */}
      {scanningGRN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: 'rgb(24,24,27)' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white font-semibold">Scan Unit Barcodes</h3>
                <p className="text-zinc-400 text-xs mt-0.5">{scanningGRN.grnNumber} — stick label on board, then scan</p>
              </div>
              <button onClick={() => { setScanningGRN(null); setScanBarcode(''); setScanResult(null); }}
                className="text-zinc-400 hover:text-white text-xl leading-none"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleScan} className="space-y-3">
              <div>
                <label className="text-zinc-400 text-xs">Scan or type barcode</label>
                <input
                  autoFocus
                  value={scanBarcode}
                  onChange={e => setScanBarcode(e.target.value.toUpperCase())}
                  placeholder="e.g. PCBPS260001"
                  className="w-full mt-1 px-4 py-3 rounded-xl text-sm text-white border border-zinc-700 outline-none focus:border-sky-500 font-mono tracking-widest"
                  style={{ background: 'rgb(39,39,42)' }}
                />
              </div>
              {scanResult && (
                <div className={`px-3 py-2 rounded-lg text-sm flex items-center gap-1 ${scanResult.ok ? 'bg-emerald-900/40 text-emerald-400' : 'bg-red-900/40 text-red-400'}`}>
                  {scanResult.ok && <Check className="w-4 h-4 mr-1 inline" />}{scanResult.message}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setScanningGRN(null); setScanBarcode(''); setScanResult(null); }}
                  className="flex-1 py-2.5 rounded-xl text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors">
                  Done
                </button>
                <button type="submit" disabled={scanSaving || !scanBarcode.trim()}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50">
                  {scanSaving ? 'Confirming…' : 'Confirm Scan'}
                </button>
              </div>
            </form>
            {/* Progress */}
            {(() => {
              const serials = grnSerials[scanningGRN.id] ?? [];
              if (!serials.length) return null;
              const confirmed = serials.filter(s => s.status !== 'PRINTED').length;
              return (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Progress</span>
                    <span>{confirmed} / {serials.length} confirmed</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-800">
                    <div className="h-2 rounded-full bg-sky-500 transition-all"
                      style={{ width: `${serials.length ? (confirmed / serials.length) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Materials Tab ────────────────────────────────────────────────────────────
function MaterialsTab({ isAdmin }: { isAdmin: boolean }) {
  const [materials,    setMaterials]    = useState<RawMaterial[]>([]);
  const [categories,   setCategories]   = useState<Category[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showMatForm,  setShowMatForm]  = useState(false);
  const [showCatForm,  setShowCatForm]  = useState(false);
  const [editMat,      setEditMat]      = useState<RawMaterial | null>(null);
  const [expandedMat,  setExpandedMat]  = useState<string | null>(null);
  const [addingVariant,setAddingVariant]= useState<string | null>(null);
  const [variantName,  setVariantName]  = useState('');
  const [vSavingVar,   setVSavingVar]   = useState(false);

  // Form state
  const [fName,      setFName]      = useState('');
  const [fUnit,      setFUnit]      = useState('');
  const [fCatId,     setFCatId]     = useState('');
  const [fMin,       setFMin]       = useState('0');
  const [fReord,     setFReord]     = useState('0');
  const [fMoq,       setFMoq]       = useState('1');
  const [fDesc,      setFDesc]      = useState('');
  const [fVendorId,      setFVendorId]      = useState('');
  const [fPurchaseUnit,  setFPurchaseUnit]  = useState('');
  const [fConvFactor,    setFConvFactor]    = useState('');
  const [fOpenQty,       setFOpenQty]       = useState('');
  const [fBarcodePrefix, setFBarcodePrefix] = useState('');
  const [fSaving,        setFSaving]        = useState(false);
  const [fError,         setFError]         = useState('');
  const [printMatId,     setPrintMatId]     = useState<string | null>(null);

  const [vendors,      setVendors]      = useState<Vendor[]>([]);
  const [filterCat,    setFilterCat]    = useState('');
  const [filterStock,  setFilterStock]  = useState<'all' | 'low' | 'critical'>('all');
  const [search,       setSearch]       = useState('');

  // Inline create category
  const [cName,          setCName]          = useState('');
  const [cCode,          setCCode]          = useState('');
  const [cDesc,          setCDesc]          = useState('');
  const [cSaving,        setCSaving]        = useState(false);
  const [cError,         setCError]         = useState('');
  const [showInlineCat,  setShowInlineCat]  = useState(false);

  // Inline create vendor
  const [vName,           setVName]           = useState('');
  const [vPhone,          setVPhone]          = useState('');
  const [vEmail,          setVEmail]          = useState('');
  const [vSaving,         setVSaving]         = useState(false);
  const [showInlineVendor,setShowInlineVendor]= useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [mRes, cRes, vRes] = await Promise.all([
      fetch('/api/inventory/materials'),
      fetch('/api/inventory/categories'),
      fetch('/api/purchase/vendors'),
    ]);
    if (mRes.ok) setMaterials(await mRes.json());
    if (cRes.ok) setCategories(await cRes.json());
    if (vRes.ok) setVendors(await vRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNewMat() {
    setEditMat(null); setFName(''); setFUnit('PCS'); setFCatId(''); setFMin('0'); setFReord('0'); setFMoq('1');
    setFDesc(''); setFVendorId(''); setFPurchaseUnit(''); setFConvFactor(''); setFOpenQty(''); setFBarcodePrefix(''); setFError('');
    setShowInlineCat(false); setShowInlineVendor(false);
    setShowMatForm(true);
  }

  function openEditMat(m: RawMaterial) {
    setEditMat(m); setFName(m.name); setFUnit(m.unit); setFCatId(m.category?.id ?? '');
    setFMin(String(m.minimumStock)); setFReord(String(m.reorderPoint)); setFMoq(String(m.minimumOrderQty ?? 1));
    setFDesc(m.description ?? '');
    setFVendorId(m.preferredVendor?.id ?? '');
    setFPurchaseUnit(m.purchaseUnit ?? ''); setFConvFactor(m.conversionFactor ? String(m.conversionFactor) : '');
    setFError('');
    setShowInlineCat(false); setShowInlineVendor(false);
    setShowMatForm(true);
  }

  async function handleMatSubmit(e: React.FormEvent) {
    e.preventDefault(); setFError(''); setFSaving(true);
    const body = {
      name: fName, unit: fUnit, categoryId: fCatId || undefined,
      description: fDesc || undefined,
      preferredVendorId: fVendorId || undefined,
      minimumStock: parseFloat(fMin) || 0, reorderPoint: parseFloat(fReord) || 0,
      minimumOrderQty: parseFloat(fMoq) || 1,
      purchaseUnit: fPurchaseUnit || undefined,
      conversionFactor: fPurchaseUnit && fConvFactor ? parseFloat(fConvFactor) : undefined,
      ...(!editMat && fBarcodePrefix.trim() ? { barcodePrefix: fBarcodePrefix.trim().toUpperCase() } : {}),
    };
    const res = editMat
      ? await fetch(`/api/inventory/materials/${editMat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/inventory/materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setFSaving(false);
    if (!res.ok) { const e = await res.json(); setFError(e.error || 'Failed'); return; }
    // For new material: if opening stock was entered, add it; then prompt to print label
    if (!editMat) {
      const mat = await res.json();
      const openQty = parseFloat(fOpenQty);
      if (!isNaN(openQty) && openQty > 0) {
        await fetch('/api/inventory/adjust', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawMaterialId: mat.id,
            type:     'OPENING',
            quantity: openQty,
            reason:   'Opening stock entry',
          }),
        });
      }
      setShowMatForm(false); load();
      setPrintMatId(mat.id);
      return;
    }
    setShowMatForm(false); load();
  }

  async function toggleActive(m: RawMaterial) {
    if (m.active && !confirm(`Deactivate "${m.name}"? It will be hidden from stock and job cards.`)) return;
    await fetch(`/api/inventory/materials/${m.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !m.active }),
    });
    load();
  }

  async function saveVariant(materialId: string) {
    if (!variantName.trim()) return;
    setVSavingVar(true);
    const res = await fetch('/api/inventory/variants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialId, name: variantName.trim() }),
    });
    setVSavingVar(false);
    if (res.ok) { setAddingVariant(null); setVariantName(''); load(); }
  }

  async function deleteVariant(id: string) {
    await fetch(`/api/inventory/variants/${id}`, { method: 'DELETE' });
    load();
  }

  async function handleCatSubmit(e: React.FormEvent) {
    e.preventDefault(); setCError(''); setCSaving(true);
    const res = await fetch('/api/inventory/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cName, code: cCode.toUpperCase(), description: cDesc || undefined }) });
    setCSaving(false);
    if (!res.ok) { const err = await res.json().catch(() => ({})); setCError(err.error || 'Failed to save category'); return; }
    setShowCatForm(false); setCName(''); setCCode(''); setCDesc(''); setCError(''); load();
  }

  async function saveInlineCat() {
    if (!cName.trim() || !cCode.trim()) return;
    setCError(''); setCSaving(true);
    const res = await fetch('/api/inventory/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: cName.trim(), code: cCode.trim().toUpperCase() }) });
    setCSaving(false);
    if (!res.ok) { const err = await res.json().catch(() => ({})); setCError(err.error || 'Failed to save'); return; }
    const cat = await res.json();
    setCategories(prev => [...prev, cat]);
    setFCatId(cat.id);
    setShowInlineCat(false); setCName(''); setCCode(''); setCError('');
  }

  async function saveInlineVendor() {
    if (!vName.trim()) return;
    setVSaving(true);
    const res = await fetch('/api/purchase/vendors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: vName.trim(), phone: vPhone.trim() || undefined, email: vEmail.trim() || undefined }) });
    if (res.ok) {
      const vendor = await res.json();
      setVendors(prev => [...prev, vendor]);
      setFVendorId(vendor.id);
    }
    setVSaving(false); setShowInlineVendor(false); setVName(''); setVPhone(''); setVEmail('');
  }

  if (loading) return <p className="text-zinc-400 text-sm py-6">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
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

      {/* Search + Filter bar */}
      <div className="rounded-xl p-3 mb-4 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or code…"
          className="w-full px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
          style={{ background: 'rgb(39,39,42)' }}
        />
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-zinc-500 text-xs">Stock:</span>
          {(['all', 'low', 'critical'] as const).map(s => (
            <button key={s} onClick={() => setFilterStock(s)}
              className={`px-2.5 py-1 rounded-lg text-xs transition-colors capitalize ${filterStock === s ? (s === 'critical' ? 'bg-red-600 text-white' : s === 'low' ? 'bg-yellow-600 text-white' : 'bg-sky-600 text-white') : 'text-zinc-400 border border-zinc-700 hover:text-white'}`}>
              {s === 'all' ? 'All' : s === 'low' ? 'Low Stock' : 'Critical'}
            </button>
          ))}
          {categories.length > 0 && (
            <>
              <span className="text-zinc-600 text-xs ml-1">|</span>
              <span className="text-zinc-500 text-xs">Category:</span>
              <button onClick={() => setFilterCat('')}
                className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${filterCat === '' ? 'bg-sky-600 text-white' : 'text-zinc-400 border border-zinc-700 hover:text-white'}`}>
                All
              </button>
              {categories.map(c => (
                <button key={c.id} onClick={() => setFilterCat(filterCat === c.id ? '' : c.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-colors ${filterCat === c.id ? 'bg-sky-600 text-white' : 'text-zinc-400 border border-zinc-700 hover:text-white'}`}>
                  {c.name}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {materials.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-zinc-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="text-5xl mb-4">🗂️</div>
          <h3 className="text-white text-lg font-semibold mb-2">No materials created yet</h3>
          <p className="text-zinc-400 text-sm mb-6 max-w-xs">
            Create your raw materials catalogue — set name, unit, HSN code, reorder levels, and preferred vendor.
          </p>
          {isAdmin && (
            <button onClick={openNewMat}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors">
              + Create First Material
            </button>
          )}
        </div>
      )}
      <div className="space-y-2">
        {materials.filter(m => {
          if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.code.toLowerCase().includes(search.toLowerCase()) && !(m.barcode ?? '').toLowerCase().includes(search.toLowerCase())) return false;
          if (filterCat && m.category?.id !== filterCat) return false;
          if (filterStock === 'critical' && !m.isCritical) return false;
          if (filterStock === 'low' && !m.isLowStock) return false;
          return true;
        }).map(m => (
          <div key={m.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            {/* Main row */}
            <div className="p-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium">{m.name}</span>
                  <span className="text-zinc-500 text-xs font-mono">{m.barcode ?? m.code}</span>
                  {m.category && <Badge color="sky">{m.category.name}</Badge>}
                  {m.isCritical && <Badge color="red">Critical</Badge>}
                  {!m.isCritical && m.isLowStock && <Badge color="yellow">Low Stock</Badge>}
                  {!m.active && <Badge color="zinc">Inactive</Badge>}
                  {(m.variants?.length ?? 0) > 0 && <Badge color="purple">{m.variants!.length} Variants</Badge>}
                </div>
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="text-zinc-400 text-xs">
                    On Hand: <span className={`font-medium ${m.isCritical ? 'text-red-400' : m.isLowStock ? 'text-yellow-400' : 'text-emerald-400'}`}>{fmt(m.currentStock)} {m.unit}</span>
                  </span>
                  {(m.committedStock ?? 0) > 0 && (
                    <span className="text-zinc-500 text-xs">Committed: <span className="text-amber-400 font-medium">{fmt(m.committedStock!)} {m.unit}</span></span>
                  )}
                  {(m.committedStock ?? 0) > 0 && (
                    <span className="text-zinc-500 text-xs">Available: <span className="text-sky-400 font-medium">{fmt(m.availableStock!)} {m.unit}</span></span>
                  )}
                  {m.purchaseUnit && m.conversionFactor && (
                    <span className="text-zinc-600 text-xs">1 {m.purchaseUnit} = {m.conversionFactor} {m.unit}</span>
                  )}
                  {m.preferredVendor && <span className="text-zinc-500 text-xs">Vendor: <span className="text-zinc-300">{m.preferredVendor.name}</span></span>}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0 flex-wrap justify-end items-center">
                {isAdmin && (
                  <button onClick={() => setExpandedMat(expandedMat === m.id ? null : m.id)}
                    className="px-2 py-1 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white transition-colors">
                    {expandedMat === m.id ? '▲ Less' : '▼ Variants'}
                  </button>
                )}
                {isAdmin && (
                  <>
                    <button onClick={() => openEditMat(m)}
                      className="px-2 py-1 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white transition-colors">Edit</button>
                    <button onClick={() => toggleActive(m)}
                      className={`px-2 py-1 rounded-lg text-xs border transition-colors ${m.active ? 'border-red-800 text-red-400 hover:bg-red-900/20' : 'border-emerald-800 text-emerald-400 hover:bg-emerald-900/20'}`}>
                      {m.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Variants section */}
            {expandedMat === m.id && (
              <div className="px-4 pb-4 border-t border-zinc-800/60">
                <div className="pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-zinc-400 text-xs font-medium">Item Variants</span>
                    {addingVariant !== m.id && (
                      <button onClick={() => { setAddingVariant(m.id); setVariantName(''); }}
                        className="text-[10px] text-sky-400 hover:text-sky-300 transition-colors">+ Add Variant</button>
                    )}
                  </div>
                  {(m.variants?.length ?? 0) === 0 && addingVariant !== m.id && (
                    <p className="text-zinc-600 text-xs italic">No variants — add one for different specs (e.g. 25V, 50V)</p>
                  )}
                  <div className="space-y-1.5">
                    {m.variants?.map(v => (
                      <div key={v.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
                        <span className="text-white text-xs font-medium flex-1">{v.name}</span>
                        <span className="text-zinc-500 text-xs font-mono">{v.barcode}</span>
                        <span className="text-sky-400 text-xs">{fmt(v.currentStock)} {m.unit}</span>
                        <button onClick={() => deleteVariant(v.id)} className="text-zinc-600 hover:text-red-400 text-xs transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                  {addingVariant === m.id && (
                    <div className="flex gap-2 mt-2">
                      <input value={variantName} onChange={e => setVariantName(e.target.value)}
                        placeholder="e.g. 25V, 50V, 100μF" autoFocus
                        className="flex-1 px-3 py-1.5 rounded-lg text-sm text-white border border-sky-700 outline-none focus:border-sky-500"
                        style={{ background: 'rgb(39,39,42)' }}
                        onKeyDown={e => e.key === 'Enter' && saveVariant(m.id)} />
                      <button onClick={() => saveVariant(m.id)} disabled={vSavingVar || !variantName.trim()}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40">
                        {vSavingVar ? '…' : 'Add'}
                      </button>
                      <button onClick={() => { setAddingVariant(null); setVariantName(''); }}
                        className="px-2 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Material Form Modal */}
      {showMatForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 my-4" style={{ background: 'rgb(24,24,27)' }}>
            <h3 className="text-white font-semibold mb-4">{editMat ? 'Edit Material' : 'New Material'}</h3>
            <form onSubmit={handleMatSubmit} className="space-y-3">
              {/* Name */}
              <div>
                <label className="text-zinc-400 text-xs">Name *</label>
                <input value={fName} onChange={e => setFName(e.target.value)} required autoFocus
                  placeholder="e.g. IGBT Module IRFB4227"
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>

              {/* Barcode Prefix (new material only — required) */}
              {!editMat && (
                <div>
                  <label className="text-zinc-400 text-xs">
                    Barcode Prefix <span className="text-red-500">*</span> <span className="text-zinc-600">(2–8 chars, letters/numbers only)</span>
                  </label>
                  <input
                    value={fBarcodePrefix}
                    onChange={e => setFBarcodePrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))}
                    placeholder="e.g. CAP, BUSBAR, IGBT, MOS, RES"
                    required
                    minLength={2}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white font-mono border border-zinc-700 outline-none focus:border-sky-500"
                    style={{ background: 'rgb(39,39,42)' }} />
                  {fBarcodePrefix.trim().length >= 2 && (
                    <p className="text-zinc-500 text-[10px] mt-0.5">
                      Barcodes: <span className="text-sky-400 font-mono">{fBarcodePrefix.trim()}0001</span>, <span className="text-sky-400 font-mono">{fBarcodePrefix.trim()}0002</span>…
                    </p>
                  )}
                </div>
              )}

              {/* Unit */}
              <div>
                <label className="text-zinc-400 text-xs">Unit *</label>
                <select value={fUnit} onChange={e => setFUnit(e.target.value)} required
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700"
                  style={{ background: 'rgb(39,39,42)' }}>
                  {['PCS','REEL','KG','GRAM','MTR','SET','BOX','LTR','ROLL'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              {/* Purchase unit + conversion */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 text-xs">Pack Size <span className="text-zinc-600">(optional — if purchased in a different unit)</span></label>
                </div>
<div className="flex gap-2">
                  <select value={fPurchaseUnit} onChange={e => setFPurchaseUnit(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700"
                    style={{ background: 'rgb(39,39,42)' }}>
                    <option value="">Same as stock unit</option>
                    {['PCS','REEL','KG','GRAM','MTR','SET','BOX','LTR','ROLL'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                  {fPurchaseUnit && (
                    <input type="number" step="any" min="1" value={fConvFactor} onChange={e => setFConvFactor(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder={`${fUnit || 'PCS'} per ${fPurchaseUnit}`}
                      className="flex-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                      style={{ background: 'rgb(39,39,42)' }} />
                  )}
                </div>
                {fPurchaseUnit && fConvFactor && (
                  <p className="text-zinc-500 text-[10px] mt-1">
                    1 {fPurchaseUnit} = {fConvFactor} {fUnit || 'PCS'} · Stock always tracked in {fUnit || 'PCS'}
                  </p>
                )}
              </div>

              {/* Category with inline create */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 text-xs">Category</label>
                  {!showInlineCat && (
                    <button type="button" onClick={() => setShowInlineCat(true)}
                      className="text-[10px] text-sky-400 hover:text-sky-300">+ Create new</button>
                  )}
                </div>
                {showInlineCat ? (
                  <div className="p-2 rounded-lg space-y-2" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)' }}>
                    <input value={cName} onChange={e => setCName(e.target.value)} placeholder="Category name *" autoFocus
                      className="w-full px-3 py-1.5 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                      style={{ background: 'rgb(39,39,42)' }} />
                    <div>
                      <input value={cCode} onChange={e => setCCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                        placeholder="Prefix/Code * e.g. CAP, PCB, RES"
                        className="w-full px-3 py-1.5 rounded-lg text-sm text-white font-mono border border-zinc-700 outline-none focus:border-sky-500"
                        style={{ background: 'rgb(39,39,42)' }} />
                      <p className="text-zinc-600 text-[10px] mt-0.5">Used for barcodes: CAP → CAP001, CAP002…</p>
                    </div>
                    {cError && <p className="text-red-400 text-[10px]">{cError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={saveInlineCat} disabled={cSaving || !cName.trim() || !cCode.trim()}
                        className="px-3 py-1 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40">
                        {cSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" onClick={() => { setShowInlineCat(false); setCName(''); setCCode(''); setCError(''); }}
                        className="px-3 py-1 rounded-lg text-xs text-zinc-400 hover:text-white">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <select value={fCatId} onChange={e => setFCatId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white border border-zinc-700"
                    style={{ background: 'rgb(39,39,42)' }}>
                    <option value="">None</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>

              {/* Preferred Vendor with inline create */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-zinc-400 text-xs">Preferred Vendor</label>
                  {!showInlineVendor && (
                    <button type="button" onClick={() => setShowInlineVendor(true)}
                      className="text-[10px] text-sky-400 hover:text-sky-300">+ Create new</button>
                  )}
                </div>
                {showInlineVendor ? (
                  <div className="p-2 rounded-lg space-y-2" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)' }}>
                    <input value={vName} onChange={e => setVName(e.target.value)} placeholder="Vendor name *" autoFocus
                      className="w-full px-3 py-1.5 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                      style={{ background: 'rgb(39,39,42)' }} />
                    <div className="grid grid-cols-2 gap-2">
                      <input value={vPhone} onChange={e => setVPhone(e.target.value)} placeholder="Phone (optional)"
                        className="px-3 py-1.5 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                        style={{ background: 'rgb(39,39,42)' }} />
                      <input value={vEmail} onChange={e => setVEmail(e.target.value)} placeholder="Email (optional)"
                        className="px-3 py-1.5 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                        style={{ background: 'rgb(39,39,42)' }} />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={saveInlineVendor} disabled={vSaving || !vName.trim()}
                        className="px-3 py-1 rounded-lg text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40">
                        {vSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button type="button" onClick={() => { setShowInlineVendor(false); setVName(''); setVPhone(''); setVEmail(''); }}
                        className="px-3 py-1 rounded-lg text-xs text-zinc-400 hover:text-white">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <select value={fVendorId} onChange={e => setFVendorId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm text-white border border-zinc-700"
                    style={{ background: 'rgb(39,39,42)' }}>
                    <option value="">None</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
                  </select>
                )}
              </div>

              {/* Min stock + Reorder + MOQ */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-zinc-400 text-xs">Min Stock</label>
                  <input type="number" step="any" min="0" value={fMin} onChange={e => setFMin(e.target.value)}
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                    style={{ background: 'rgb(39,39,42)' }} />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs">Reorder Point</label>
                  <input type="number" step="any" min="0" value={fReord} onChange={e => setFReord(e.target.value)}
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                    style={{ background: 'rgb(39,39,42)' }} />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs">Min Order Qty</label>
                  <input type="number" step="any" min="1" value={fMoq} onChange={e => setFMoq(e.target.value)}
                    onWheel={e => (e.target as HTMLInputElement).blur()}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                    style={{ background: 'rgb(39,39,42)' }} />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-zinc-400 text-xs">Description <span className="text-zinc-600">(optional)</span></label>
                <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2}
                  placeholder="Specifications, notes…"
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500 resize-none"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>

              {/* Opening stock — only for new materials */}
              {!editMat && (
                <div className="pt-2 border-t border-zinc-800">
                  <p className="text-zinc-400 text-xs mb-2">Opening Stock <span className="text-zinc-600">(optional — enter if stock already exists)</span></p>
                  <div>
                    <label className="text-zinc-500 text-xs">Qty ({fUnit})</label>
                    <input type="number" step="any" min="0" value={fOpenQty} onChange={e => setFOpenQty(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                      style={{ background: 'rgb(39,39,42)' }} placeholder="0" />
                  </div>
                </div>
              )}
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
      {/* Print Label after new material creation */}
      {printMatId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: 'rgb(24,24,27)' }}>
            <div className="text-4xl mb-3">🏷️</div>
            <h3 className="text-white font-semibold mb-1">Material Created</h3>
            <p className="text-zinc-400 text-sm mb-5">Print the barcode label for this material?</p>
            <div className="flex gap-3">
              <button onClick={() => setPrintMatId(null)}
                className="flex-1 py-2 rounded-lg text-sm text-zinc-400 border border-zinc-700 hover:text-white transition-colors">
                Skip
              </button>
              <a href={`/print/material-label/${printMatId}`} target="_blank"
                onClick={() => setPrintMatId(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-700 hover:bg-purple-600 text-white transition-colors text-center">
                Print Label
              </a>
            </div>
          </div>
        </div>
      )}

      {showCatForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-xs rounded-2xl p-6" style={{ background: 'rgb(24,24,27)' }}>
            <h3 className="text-white font-semibold mb-4">New Category</h3>
            <form onSubmit={handleCatSubmit} className="space-y-3">
              <div>
                <label className="text-zinc-400 text-xs">Name *</label>
                <input value={cName} onChange={e => setCName(e.target.value)} required autoFocus
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Prefix / Code * <span className="text-zinc-600">(up to 6 chars, used for barcodes)</span></label>
                <input value={cCode} onChange={e => setCCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} required
                  placeholder="e.g. CAP, PCB, MOS, RES"
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white font-mono border border-zinc-700 outline-none focus:border-sky-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Description</label>
                <input value={cDesc} onChange={e => setCDesc(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                  style={{ background: 'rgb(39,39,42)' }} />
              </div>
              {cError && <p className="text-red-400 text-xs">{cError}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowCatForm(false); setCName(''); setCCode(''); setCDesc(''); setCError(''); }}
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

// ─── Job Cards Tab (Full-screen scan-based dispatch) ─────────────────────────
interface JobCardItem {
  id: string;
  rawMaterialId: string;
  quantityReq: number;
  quantityIssued: number;
  isCritical: boolean;
  rawMaterial: { id: string; name: string; code: string; unit: string; barcode?: string | null; currentStock: number };
  batch?: { id: string; batchCode: string; remainingQty: number } | null;
}

interface JobCard {
  id: string;
  cardNumber: string;
  stage: string;
  status: string;
  dispatchType?: string | null;
  orderQuantity: number;
  createdAt: string;
  dispatchedAt?: string | null;
  order: { orderNumber: string; quantity: number };
  unit?: { serialNumber: string } | null;
  createdBy: { name: string };
  dispatchedBy?: { name: string } | null;
  items: JobCardItem[];
}

const STAGE_LABEL_JC: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'Powerstage', BRAINBOARD_MANUFACTURING: 'Brainboard',
  CONTROLLER_ASSEMBLY: 'Assembly', QC_AND_SOFTWARE: 'QC & Software',
  REWORK: 'Rework', FINAL_ASSEMBLY: 'Final Assembly',
};

function JobCardsTab({ sessionRole }: { sessionRole: string }) {
  const [cards,   setCards]   = useState<JobCard[]>([]);
  const [tab,     setTab]     = useState<'pending' | 'dispatched'>('pending');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState<JobCard | null>(null);

  const canDispatch = ['INVENTORY_MANAGER', 'ADMIN'].includes(sessionRole);

  const load = useCallback(async () => {
    setLoading(true);
    const status = tab === 'pending' ? 'PENDING' : 'DISPATCHED';
    const res = await fetch(`/api/inventory/job-cards?status=${status}`);
    if (res.ok) setCards(await res.json());
    setLoading(false);
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  // ── Full-screen scan panel ──
  if (scanning) {
    return <JobCardScanPanel card={scanning} onClose={() => setScanning(null)} onDone={() => { setScanning(null); load(); }} />;
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {(['pending', 'dispatched'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-sky-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}>
            {t === 'pending' ? 'Pending' : 'Dispatched'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-2xl border border-dashed border-zinc-700" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <p className="text-zinc-400 text-sm">No {tab} job cards</p>
          {tab === 'pending' && <p className="text-zinc-600 text-xs mt-1">Created when production employees accept an order</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map(card => {
            const criticalShort = card.items.filter(i => i.isCritical && i.rawMaterial.currentStock < i.quantityReq).length;
            return (
              <div key={card.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-semibold font-mono text-sm">{card.cardNumber}</span>
                      <Badge color={tab === 'pending' ? 'yellow' : 'green'}>{card.status}</Badge>
                      <Badge color="sky">{STAGE_LABEL_JC[card.stage] ?? card.stage.replace(/_/g, ' ')}</Badge>
                      {card.dispatchType && (
                        <Badge color={card.dispatchType === 'FULL' ? 'green' : 'yellow'}>{card.dispatchType === 'FULL' ? 'Full' : 'Partial'}</Badge>
                      )}
                      {criticalShort > 0 && tab === 'pending' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 text-red-400">{criticalShort} critical short</span>
                      )}
                    </div>
                    <p className="text-zinc-400 text-xs mt-1.5">
                      Order <span className="text-zinc-300">{card.order.orderNumber}</span>
                      {' · '}<span className="text-zinc-300">{card.orderQuantity} unit{card.orderQuantity !== 1 ? 's' : ''}</span>
                      {' · '}By {card.createdBy.name}
                    </p>
                    {card.dispatchedAt && (
                      <p className="text-zinc-500 text-xs mt-0.5">
                        Dispatched {card.dispatchedBy?.name ? `by ${card.dispatchedBy.name}` : ''} {fmtDate(card.dispatchedAt)}
                      </p>
                    )}
                    <p className="text-zinc-600 text-[10px] mt-0.5">{card.items.length} items · {fmtDate(card.createdAt)}</p>
                  </div>
                  <div className="flex gap-2 shrink-0 items-center">
                    <button onClick={() => window.open(`/print/job-card/${card.id}`, '_blank')}
                      className="px-2 py-1.5 rounded-lg text-xs text-zinc-400 border border-zinc-700 hover:text-white transition-colors">
                      Print
                    </button>
                    {canDispatch && card.status === 'PENDING' && (
                      <button onClick={() => setScanning(card)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-all"
                        style={{ background: 'rgba(34,197,94,0.8)' }}>
                        <ScanLine className="w-4 h-4" /> Scan & Dispatch
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Full-screen scan panel for dispatching a job card ─────────────────────────
function JobCardScanPanel({ card, onClose, onDone }: { card: JobCard; onClose: () => void; onDone: () => void }) {
  const scanRef = useRef<HTMLInputElement>(null);
  const [scanInput, setScanInput] = useState('');
  const [scanned, setScanned]     = useState<Record<string, number>>({}); // itemId → scan count
  const [lastScan, setLastScan]   = useState<{ text: string; ok: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => { scanRef.current?.focus(); }, []);

  const totalQtyNeeded  = card.items.reduce((s, i) => s + i.quantityReq, 0);
  const totalQtyScanned = card.items.reduce((s, i) => s + (scanned[i.id] ?? 0), 0);
  const allScanned      = card.items.every(i => (scanned[i.id] ?? 0) >= i.quantityReq);

  function handleScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const val = scanInput.trim().toUpperCase();
    setScanInput('');
    if (!val) return;

    const found = card.items.find(i =>
      (i.rawMaterial.barcode?.toUpperCase() === val || i.rawMaterial.code.toUpperCase() === val)
      && (scanned[i.id] ?? 0) < i.quantityReq
    );

    if (found) {
      const newCount = (scanned[found.id] ?? 0) + 1;
      setScanned(prev => ({ ...prev, [found.id]: newCount }));
      setLastScan({ text: `${found.rawMaterial.name} (${newCount}/${fmt(found.quantityReq)})`, ok: true });
    } else {
      const fullyDone = card.items.find(i =>
        (i.rawMaterial.barcode?.toUpperCase() === val || i.rawMaterial.code.toUpperCase() === val)
        && (scanned[i.id] ?? 0) >= i.quantityReq
      );
      if (fullyDone) {
        setLastScan({ text: `${fullyDone.rawMaterial.name} — all ${fmt(fullyDone.quantityReq)} already scanned`, ok: false });
      } else {
        setLastScan({ text: `"${val}" not found in this job card`, ok: false });
      }
    }

    setTimeout(() => setLastScan(null), 3000);
    scanRef.current?.focus();
  }

  function undoScan(itemId: string) {
    setScanned(prev => {
      const cur = prev[itemId] ?? 0;
      if (cur <= 1) { const n = { ...prev }; delete n[itemId]; return n; }
      return { ...prev, [itemId]: cur - 1 };
    });
  }

  async function handleDispatch() {
    setSubmitting(true);
    setError('');
    const items = card.items.map(item => ({
      jobCardItemId: item.id,
      issuedQty: scanned[item.id] ?? 0,
    }));

    const res = await fetch(`/api/inventory/job-cards/${card.id}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    setSubmitting(false);

    if (res.ok) {
      onDone();
    } else {
      const data = await res.json();
      if (data.criticalErrors) setError(data.criticalErrors.join('\n'));
      else if (data.stockErrors) setError(data.stockErrors.join('\n'));
      else setError(data.error || 'Dispatch failed');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgb(9,9,11)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <button onClick={onClose} className="text-zinc-400 hover:text-white p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm">{card.cardNumber}</p>
          <p className="text-zinc-500 text-xs">{card.order.orderNumber} · {card.orderQuantity} units · {STAGE_LABEL_JC[card.stage] ?? card.stage}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold" style={{ color: allScanned ? '#4ade80' : '#fbbf24' }}>{totalQtyScanned}/{fmt(totalQtyNeeded)}</p>
          <p className="text-zinc-600 text-[10px]">scans</p>
        </div>
      </div>

      {/* Scan input — large and prominent */}
      <div className="px-4 py-4 border-b border-zinc-800/50" style={{ background: 'rgba(14,165,233,0.03)' }}>
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'rgba(14,165,233,0.08)', border: '2px solid rgba(14,165,233,0.25)' }}>
          <ScanLine className="w-6 h-6 text-sky-400 shrink-0" />
          <input
            ref={scanRef}
            type="text"
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            onKeyDown={handleScan}
            placeholder="Scan item barcode..."
            autoFocus
            className="flex-1 bg-transparent text-lg text-white placeholder-zinc-600 outline-none font-mono"
          />
        </div>
        {/* Scan feedback */}
        {lastScan && (
          <div className={`mt-2 px-4 py-2 rounded-xl text-sm font-medium ${lastScan.ok ? 'text-emerald-400 bg-emerald-900/20' : 'text-red-400 bg-red-900/20'}`}>
            {lastScan.ok ? <Check className="w-4 h-4 inline mr-1.5" /> : <X className="w-4 h-4 inline mr-1.5" />}
            {lastScan.text}
          </div>
        )}
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {card.items.map(item => {
          const qty   = scanned[item.id] ?? 0;
          const need  = item.quantityReq;
          const done  = qty >= need;
          const stock = item.rawMaterial.currentStock;
          const ok    = stock >= need;
          const pct   = need > 0 ? Math.min(100, (qty / need) * 100) : 0;

          return (
            <div key={item.id}
              className="rounded-xl px-3 py-2.5 transition-all"
              style={{
                background: done ? 'rgba(34,197,94,0.08)' : qty > 0 ? 'rgba(14,165,233,0.06)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${done ? 'rgba(34,197,94,0.25)' : item.isCritical ? 'rgba(251,113,133,0.2)' : 'rgba(255,255,255,0.05)'}`,
              }}>
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500' : qty > 0 ? 'bg-sky-600' : 'bg-zinc-800'}`}>
                  {done ? <Check className="w-4 h-4 text-white" /> : qty > 0 ? <span className="text-white text-[10px] font-bold">{qty}</span> : <span className="w-2 h-2 rounded-full" style={{ background: ok ? '#4ade80' : stock > 0 ? '#fbbf24' : '#f87171' }} />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-200 text-sm truncate">{item.rawMaterial.name}</span>
                    {item.isCritical && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0" style={{ background: 'rgba(251,113,133,0.12)', color: '#fb7185' }}>CRITICAL</span>
                    )}
                    <span className={`text-xs font-mono shrink-0 ${done ? 'text-emerald-400' : qty > 0 ? 'text-sky-400' : 'text-zinc-600'}`}>
                      {qty}/{fmt(need)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-zinc-600 font-mono text-[10px]">{item.rawMaterial.barcode ?? item.rawMaterial.code}</span>
                    <span className={`text-[10px] ${ok ? 'text-emerald-400' : stock > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      Stock: {stock <= 0 ? 'None' : fmt(stock)}
                    </span>
                  </div>
                  {need > 1 && (
                    <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: done ? '#4ade80' : '#38bdf8' }} />
                    </div>
                  )}
                </div>

                {qty > 0 && (
                  <button onClick={() => undoScan(item.id)} className="text-zinc-500 hover:text-red-400 p-1 shrink-0" title="Undo one scan">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 border-t border-red-900/30" style={{ background: 'rgba(239,68,68,0.06)' }}>
          <p className="text-red-400 text-xs whitespace-pre-line">{error}</p>
        </div>
      )}

      {/* Footer — dispatch button */}
      <div className="px-4 py-4 border-t border-zinc-800 flex items-center gap-3" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="flex-1">
          {allScanned ? (
            <span className="text-emerald-400 text-sm font-medium">All items scanned — ready to dispatch</span>
          ) : totalQtyScanned > 0 ? (
            <span className="text-amber-400 text-sm">{totalQtyScanned}/{fmt(totalQtyNeeded)} scans</span>
          ) : (
            <span className="text-zinc-500 text-sm">Scan items to begin</span>
          )}
        </div>
        <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-zinc-400 border border-zinc-700">Cancel</button>
        <button
          onClick={handleDispatch}
          disabled={submitting || !allScanned}
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
          style={{ background: 'rgba(34,197,94,0.9)' }}>
          {submitting ? 'Dispatching...' : 'Dispatch'}
        </button>
      </div>
    </div>
  );
}

// ─── Movements Tab ────────────────────────────────────────────────────────────
function MovementsTab() {
  const [data,    setData]    = useState<{ movements: StockMovement[]; total: number; totalPages: number }>({ movements: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate,   setToDate]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (typeFilter) params.set('type', typeFilter);
    if (fromDate)   params.set('from', fromDate);
    if (toDate)     params.set('to',   toDate);
    const res = await fetch(`/api/inventory/movements?${params}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [page, typeFilter, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <span className="text-zinc-400 text-sm flex-1 min-w-0">{data.total} movements</span>
        <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }}
          className="px-2 py-1.5 rounded-lg text-xs text-white border border-zinc-700"
          style={{ background: 'rgb(24,24,27)' }} />
        <span className="text-zinc-500 text-xs">to</span>
        <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }}
          className="px-2 py-1.5 rounded-lg text-xs text-white border border-zinc-700"
          style={{ background: 'rgb(24,24,27)' }} />
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-3 py-1.5 rounded-lg text-sm text-white border border-zinc-700"
          style={{ background: 'rgb(24,24,27)' }}>
          <option value="">All Types</option>
          <option value="IN">IN</option>
          <option value="OUT">OUT</option>
          <option value="ADJUSTMENT">Adjustment</option>
        </select>
        {(fromDate || toDate || typeFilter) && (
          <button onClick={() => { setFromDate(''); setToDate(''); setTypeFilter(''); setPage(1); }}
            className="px-2 py-1.5 text-xs text-zinc-400 hover:text-white transition-colors">Clear</button>
        )}
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

// ─── Reports Tab ─────────────────────────────────────────────────────────────
type ReportView = 'summary' | 'valuation' | 'reorder' | 'aging' | 'movements';

interface SummaryRow { id: string; code: string; name: string; unit: string; category?: { name: string } | null; openingQty: number; qtyIn: number; qtyOut: number; closingQty: number; stockValue: number; isLowStock: boolean; isCritical: boolean; }
interface ReorderRow { id: string; code: string; name: string; unit: string; category?: { name: string } | null; currentStock: number; reorderPoint: number; suggestedQty: number; leadTimeDays: number; preferredVendor?: { name: string } | null; hasPendingPR: boolean; isCritical: boolean; }
interface AgingRow { id: string; name: string; code: string; barcode: string | null; unit: string; category: string | null; bucket0_30: number; bucket31_60: number; bucket61_90: number; bucket90plus: number; totalQty: number; totalValue: number; }

function ReportsTab({ isAdmin }: { isAdmin: boolean }) {
  const [view, setView]           = useState<ReportView>('summary');
  const [loading, setLoading]     = useState(false);
  const [fromDate, setFromDate]   = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate]       = useState(() => new Date().toISOString().split('T')[0]);
  const [summaryData, setSummaryData] = useState<{ materials: SummaryRow[]; totalValue: number } | null>(null);
  const [reorderData, setReorderData] = useState<ReorderRow[]>([]);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [reorderMsg,  setReorderMsg]  = useState('');
  const [agingData,   setAgingData]   = useState<{ rows: AgingRow[]; totalValue: number } | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/inventory/reports/summary?from=${fromDate}&to=${toDate}`);
    if (res.ok) setSummaryData(await res.json());
    setLoading(false);
  }, [fromDate, toDate]);

  const loadReorder = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventory/reports/reorder');
    if (res.ok) setReorderData(await res.json());
    setLoading(false);
  }, []);

  const loadAging = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventory/reports/aging');
    if (res.ok) setAgingData(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (view === 'summary' || view === 'valuation') loadSummary();
    if (view === 'reorder') loadReorder();
    if (view === 'aging') loadAging();
  }, [view, loadSummary, loadReorder, loadAging]);

  async function handleCreateAllPRs() {
    setReorderBusy(true); setReorderMsg('');
    const res = await fetch('/api/inventory/reorder-prs', { method: 'POST' });
    setReorderBusy(false);
    const data = await res.json();
    if (res.ok) { setReorderMsg(`Created ${data.created} PR${data.created !== 1 ? 's' : ''}`); loadReorder(); }
    else setReorderMsg('Failed');
    setTimeout(() => setReorderMsg(''), 4000);
  }

  function exportCSV(rows: object[], filename: string) {
    const headers = Object.keys(rows[0] ?? {});
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => JSON.stringify((r as any)[h] ?? '')).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = filename;
    a.click();
  }

  return (
    <div>
      {/* Sub-view pills */}
      <div className="flex gap-1 p-1 rounded-xl mb-5 overflow-x-auto" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {(['summary', 'valuation', 'aging', 'reorder', 'movements'] as ReportView[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${view === v ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
            {v === 'summary' ? 'Stock Summary' : v === 'valuation' ? 'Valuation' : v === 'aging' ? 'Aging' : v === 'reorder' ? 'Reorder' : 'Movements'}
          </button>
        ))}
      </div>

      {/* Date range — for summary/valuation */}
      {(view === 'summary' || view === 'valuation') && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-zinc-400 text-xs">Period:</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs text-white border border-zinc-700"
            style={{ background: 'rgb(24,24,27)' }} />
          <span className="text-zinc-500 text-xs">to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="px-2 py-1.5 rounded-lg text-xs text-white border border-zinc-700"
            style={{ background: 'rgb(24,24,27)' }} />
          <button onClick={() => view === 'summary' || view === 'valuation' ? loadSummary() : undefined}
            className="px-3 py-1.5 rounded-lg text-xs bg-sky-700 hover:bg-sky-600 text-white transition-colors">
            Apply
          </button>
          {summaryData && (
            <button onClick={() => exportCSV(
              view === 'valuation'
                ? summaryData.materials.map(m => ({ Code: m.code, Name: m.name, Unit: m.unit, 'Closing Qty': m.closingQty, 'Stock Value': m.stockValue.toFixed(2) }))
                : summaryData.materials.map(m => ({ Code: m.code, Name: m.name, Unit: m.unit, Opening: m.openingQty, 'Qty In': m.qtyIn, 'Qty Out': m.qtyOut, Closing: m.closingQty, Value: m.stockValue.toFixed(2) })),
              `${view}-${fromDate}.csv`
            )}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs text-zinc-300 border border-zinc-700 hover:border-sky-500 transition-colors">
              Export CSV
            </button>
          )}
        </div>
      )}

      {loading && <p className="text-zinc-400 text-sm py-6">Loading…</p>}

      {/* STOCK SUMMARY */}
      {!loading && view === 'summary' && summaryData && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-zinc-400 text-sm">{summaryData.materials.length} materials</span>
            <span className="text-emerald-400 text-sm font-medium ml-auto">Total: {fmtCur(summaryData.totalValue)}</span>
          </div>
          <div className="overflow-x-auto rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left px-3 py-2">Material</th>
                  <th className="text-right px-3 py-2">Opening</th>
                  <th className="text-right px-3 py-2">Qty In</th>
                  <th className="text-right px-3 py-2">Qty Out</th>
                  <th className="text-right px-3 py-2">Closing</th>
                  <th className="text-right px-3 py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.materials.map(m => (
                  <tr key={m.id} className="border-b border-zinc-800/40 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <div className="text-white">{m.name}</div>
                      <div className="text-zinc-500">{m.code} · {m.unit}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-400">{fmt(m.openingQty)}</td>
                    <td className="px-3 py-2 text-right text-emerald-400">{m.qtyIn > 0 ? `+${fmt(m.qtyIn)}` : <span className="text-zinc-600">—</span>}</td>
                    <td className="px-3 py-2 text-right text-red-400">{m.qtyOut > 0 ? `−${fmt(m.qtyOut)}` : <span className="text-zinc-600">—</span>}</td>
                    <td className={`px-3 py-2 text-right font-medium ${m.isCritical ? 'text-red-400' : m.isLowStock ? 'text-yellow-400' : 'text-white'}`}>{fmt(m.closingQty)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{fmtCur(m.stockValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STOCK VALUATION */}
      {!loading && view === 'valuation' && summaryData && (
        <div>
          <div className="rounded-xl p-4 mb-4 flex items-center justify-between" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <div>
              <p className="text-zinc-400 text-xs">Total Inventory Value (FIFO)</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{fmtCur(summaryData.totalValue)}</p>
            </div>
            <p className="text-zinc-500 text-xs">As of {fmtDate(toDate)}</p>
          </div>
          <div className="overflow-x-auto rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left px-3 py-2">Material</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-right px-3 py-2">Qty on Hand</th>
                  <th className="text-right px-3 py-2">Stock Value</th>
                  <th className="text-right px-3 py-2">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {[...summaryData.materials].sort((a, b) => b.stockValue - a.stockValue).map(m => (
                  <tr key={m.id} className="border-b border-zinc-800/40 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <div className="text-white">{m.name}</div>
                      <div className="text-zinc-500">{m.code} · {m.unit}</div>
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{m.category?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{fmt(m.closingQty)}</td>
                    <td className="px-3 py-2 text-right font-medium text-emerald-400">{fmtCur(m.stockValue)}</td>
                    <td className="px-3 py-2 text-right text-zinc-500">
                      {summaryData.totalValue > 0 ? `${((m.stockValue / summaryData.totalValue) * 100).toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* REORDER REPORT */}
      {!loading && view === 'reorder' && (
        <div>
          <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
            <span className="text-zinc-400 text-sm">{reorderData.length} item{reorderData.length !== 1 ? 's' : ''} below reorder point</span>
            <div className="flex items-center gap-2">
              {reorderMsg && <span className="inline-flex items-center text-xs text-emerald-400"><Check className="w-4 h-4 mr-1 inline" />{reorderMsg}</span>}
              {isAdmin && (
                <button onClick={handleCreateAllPRs} disabled={reorderBusy}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-700 hover:bg-sky-600 text-white transition-colors disabled:opacity-50">
                  {reorderBusy ? 'Creating…' : 'Create All PRs'}
                </button>
              )}
              {reorderData.length > 0 && (
                <button onClick={() => exportCSV(reorderData.map(r => ({ Code: r.code, Name: r.name, Unit: r.unit, 'Current Stock': r.currentStock, 'Reorder Point': r.reorderPoint, 'Suggested Order Qty': r.suggestedQty, 'Lead Time (days)': r.leadTimeDays, 'Preferred Vendor': r.preferredVendor?.name ?? '', 'Has Open PR': r.hasPendingPR ? 'Yes' : 'No' })), 'reorder-report.csv')}
                  className="px-3 py-1.5 rounded-lg text-xs text-zinc-300 border border-zinc-700 hover:border-sky-500 transition-colors">
                  Export CSV
                </button>
              )}
            </div>
          </div>
          {reorderData.length === 0
            ? <p className="text-zinc-400 text-sm py-6 text-center">All materials are above reorder point</p>
            : (
              <div className="overflow-x-auto rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-800">
                      <th className="text-left px-3 py-2">Material</th>
                      <th className="text-right px-3 py-2">Stock</th>
                      <th className="text-right px-3 py-2">Reorder Pt</th>
                      <th className="text-right px-3 py-2">Order Qty</th>
                      <th className="text-right px-3 py-2">Lead Time</th>
                      <th className="text-left px-3 py-2">Vendor</th>
                      <th className="text-left px-3 py-2">PR Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reorderData.map(r => (
                      <tr key={r.id} className="border-b border-zinc-800/40 hover:bg-white/5">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-white">{r.name}</span>
                            {r.isCritical ? <Badge color="red">OUT</Badge> : <Badge color="yellow">LOW</Badge>}
                          </div>
                          <div className="text-zinc-500">{r.code} · {r.unit}</div>
                        </td>
                        <td className={`px-3 py-2 text-right font-medium ${r.isCritical ? 'text-red-400' : 'text-yellow-400'}`}>{fmt(r.currentStock)}</td>
                        <td className="px-3 py-2 text-right text-zinc-400">{fmt(r.reorderPoint)}</td>
                        <td className="px-3 py-2 text-right text-sky-400 font-medium">{fmt(r.suggestedQty)}</td>
                        <td className="px-3 py-2 text-right text-zinc-400">{r.leadTimeDays}d</td>
                        <td className="px-3 py-2 text-zinc-300">{r.preferredVendor?.name ?? <span className="text-zinc-600">—</span>}</td>
                        <td className="px-3 py-2">
                          {r.hasPendingPR
                            ? <Badge color="sky">Open PR</Badge>
                            : isAdmin
                              ? <a href={`/purchase?preMaterial=${r.id}&preQty=${r.suggestedQty}`}
                                  className="text-sky-400 hover:text-sky-300 transition-colors">Create PR</a>
                              : <span className="text-zinc-600">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* INVENTORY AGING */}
      {!loading && view === 'aging' && agingData && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-sm">{agingData.rows.length} materials with stock</span>
            <span className="text-emerald-400 text-sm font-medium">Total: {fmtCur(agingData.totalValue)}</span>
          </div>
          <div className="overflow-x-auto rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left px-3 py-2">Material</th>
                  <th className="text-right px-3 py-2 text-emerald-500">0–30 days</th>
                  <th className="text-right px-3 py-2 text-yellow-500">31–60 days</th>
                  <th className="text-right px-3 py-2 text-orange-500">61–90 days</th>
                  <th className="text-right px-3 py-2 text-red-500">90+ days</th>
                  <th className="text-right px-3 py-2">Total Qty</th>
                  <th className="text-right px-3 py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {agingData.rows.map(r => (
                  <tr key={r.id} className="border-b border-zinc-800/40 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <div className="text-white">{r.name}</div>
                      <div className="text-zinc-500">{r.barcode ?? r.code} · {r.unit}{r.category && ` · ${r.category}`}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-400">{r.bucket0_30 > 0 ? fmt(r.bucket0_30) : <span className="text-zinc-700">—</span>}</td>
                    <td className="px-3 py-2 text-right text-yellow-400">{r.bucket31_60 > 0 ? fmt(r.bucket31_60) : <span className="text-zinc-700">—</span>}</td>
                    <td className="px-3 py-2 text-right text-orange-400">{r.bucket61_90 > 0 ? fmt(r.bucket61_90) : <span className="text-zinc-700">—</span>}</td>
                    <td className="px-3 py-2 text-right text-red-400">{r.bucket90plus > 0 ? fmt(r.bucket90plus) : <span className="text-zinc-700">—</span>}</td>
                    <td className="px-3 py-2 text-right text-zinc-300 font-medium">{fmt(r.totalQty)}</td>
                    <td className="px-3 py-2 text-right text-zinc-300">{fmtCur(r.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MOVEMENTS LOG */}
      {view === 'movements' && <MovementsTab />}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
interface UOM { id: string; name: string; symbol: string; type: string; }

function SettingsTab({ isAdmin }: { isAdmin: boolean }) {
  const [uoms,    setUoms]    = useState<UOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [uName,   setUName]   = useState('');
  const [uSym,    setUSym]    = useState('');
  const [uType,   setUType]   = useState('QUANTITY');
  const [uSaving, setUSaving] = useState(false);
  const [uError,  setUError]  = useState('');

  const PRESET_UNITS = [
    { name: 'Pieces',      symbol: 'PCS',  type: 'QUANTITY' },
    { name: 'Reel',        symbol: 'REEL', type: 'QUANTITY' },
    { name: 'Set',         symbol: 'SET',  type: 'QUANTITY' },
    { name: 'Box',         symbol: 'BOX',  type: 'QUANTITY' },
    { name: 'Roll',        symbol: 'ROLL', type: 'QUANTITY' },
    { name: 'Kilogram',    symbol: 'KG',   type: 'WEIGHT'   },
    { name: 'Gram',        symbol: 'GRAM', type: 'WEIGHT'   },
    { name: 'Litre',       symbol: 'LTR',  type: 'VOLUME'   },
    { name: 'Metre',       symbol: 'MTR',  type: 'LENGTH'   },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/inventory/uom');
    if (res.ok) setUoms(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addPreset(p: typeof PRESET_UNITS[0]) {
    setUSaving(true);
    await fetch('/api/inventory/uom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
    setUSaving(false); load();
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault(); setUError(''); setUSaving(true);
    const res = await fetch('/api/inventory/uom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: uName.trim(), symbol: uSym.trim().toUpperCase(), type: uType }) });
    setUSaving(false);
    if (!res.ok) { const err = await res.json().catch(() => ({})); setUError(err.error || 'Failed'); return; }
    setUName(''); setUSym(''); load();
  }

  async function deleteUOM(id: string) {
    await fetch(`/api/inventory/uom/${id}`, { method: 'DELETE' });
    load();
  }

  const existingSymbols = new Set(uoms.map(u => u.symbol));
  const typeColor: Record<string, string> = { QUANTITY: 'sky', WEIGHT: 'orange', VOLUME: 'purple', LENGTH: 'green' };

  if (loading) return <p className="text-zinc-400 text-sm py-6">Loading…</p>;

  return (
    <div className="space-y-6">
      {/* UOM Section */}
      <div>
        <h3 className="text-white font-medium mb-3">Units of Measurement</h3>
        <p className="text-zinc-500 text-xs mb-4">Define your global unit library. These units are used across materials, BOM, and purchase orders.</p>

        {/* Preset quick-add */}
        <div className="mb-4">
          <p className="text-zinc-400 text-xs mb-2">Quick add:</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_UNITS.filter(p => !existingSymbols.has(p.symbol)).map(p => (
              <button key={p.symbol} onClick={() => addPreset(p)} disabled={uSaving}
                className="px-2.5 py-1 rounded-full text-xs border border-zinc-700 text-zinc-400 hover:border-sky-500 hover:text-sky-400 transition-colors disabled:opacity-40">
                + {p.symbol}
              </button>
            ))}
            {PRESET_UNITS.every(p => existingSymbols.has(p.symbol)) && (
              <span className="text-zinc-600 text-xs italic">All standard units added</span>
            )}
          </div>
        </div>

        {/* Existing UOMs */}
        {uoms.length > 0 && (
          <div className="rounded-xl overflow-hidden mb-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <div className="grid" style={{ gridTemplateColumns: '1fr 80px 100px 32px' }}>
              <div className="px-3 py-2 text-zinc-500 text-xs border-b border-zinc-800">Name</div>
              <div className="px-3 py-2 text-zinc-500 text-xs border-b border-zinc-800">Symbol</div>
              <div className="px-3 py-2 text-zinc-500 text-xs border-b border-zinc-800">Type</div>
              <div className="border-b border-zinc-800" />
              {uoms.map(u => (
                <>
                  <div key={`n-${u.id}`} className="px-3 py-2 text-white text-sm border-b border-zinc-800/40">{u.name}</div>
                  <div key={`s-${u.id}`} className="px-3 py-2 text-sky-400 text-xs font-mono font-medium border-b border-zinc-800/40">{u.symbol}</div>
                  <div key={`t-${u.id}`} className="px-3 py-2 border-b border-zinc-800/40"><Badge color={typeColor[u.type] ?? 'zinc'}>{u.type}</Badge></div>
                  <div key={`d-${u.id}`} className="px-3 py-2 border-b border-zinc-800/40 flex items-center justify-center">
                    {isAdmin && <button onClick={() => deleteUOM(u.id)} className="text-zinc-600 hover:text-red-400 text-xs transition-colors"><X className="w-4 h-4" /></button>}
                  </div>
                </>
              ))}
            </div>
          </div>
        )}

        {/* Custom UOM form */}
        {isAdmin && (
          <form onSubmit={handleAdd} className="flex gap-2 flex-wrap items-end">
            <div>
              <label className="text-zinc-500 text-xs">Name</label>
              <input value={uName} onChange={e => setUName(e.target.value)} required placeholder="e.g. Reel"
                className="mt-1 block px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500 w-36"
                style={{ background: 'rgb(39,39,42)' }} />
            </div>
            <div>
              <label className="text-zinc-500 text-xs">Symbol</label>
              <input value={uSym} onChange={e => setUSym(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8))} required placeholder="REEL"
                className="mt-1 block px-3 py-2 rounded-lg text-sm text-white font-mono border border-zinc-700 outline-none focus:border-sky-500 w-24"
                style={{ background: 'rgb(39,39,42)' }} />
            </div>
            <div>
              <label className="text-zinc-500 text-xs">Type</label>
              <select value={uType} onChange={e => setUType(e.target.value)} required
                className="mt-1 block px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 w-32"
                style={{ background: 'rgb(39,39,42)' }}>
                {['QUANTITY', 'WEIGHT', 'VOLUME', 'LENGTH'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button type="submit" disabled={uSaving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50">
              {uSaving ? '…' : 'Add Unit'}
            </button>
          </form>
        )}
        {uError && <p className="text-red-400 text-xs mt-2">{uError}</p>}
      </div>
    </div>
  );
}


// ─── Main Panel ───────────────────────────────────────────────────────────────
// ─── Rework Requests Tab ─────────────────────────────────────────────────────

type ReworkMatRow = {
  id: string;
  materialName: string;
  unit: string;
  qtyRequested: number;
  qtyIssued: number;
  currentStock: number;
  status: string;
  notes: string | null;
  requestedBy: { name: string };
  issuedBy: { name: string } | null;
  issuedAt: string | null;
  createdAt: string;
  returnRequest: {
    id: string;
    returnNumber: string;
    serialNumber: string | null;
    client: { customerName: string };
  };
};

function ReworkTab({ canIssue }: { canIssue: boolean }) {
  const [rows, setRows] = useState<ReworkMatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState<string | null>(null);
  const [filter, setFilter] = useState<'PENDING' | 'ISSUED' | 'ALL'>('PENDING');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch('/api/returns/materials/pending');
      if (res.ok) setRows(await res.json());
      setLoading(false);
    }
    load();
  }, []);

  async function issue(row: ReworkMatRow) {
    setIssuing(row.id);
    const res = await fetch(`/api/returns/${row.returnRequest.id}/materials/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ISSUE' }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, ...updated } : r));
    } else {
      const j = await res.json();
      alert(j.error ?? 'Failed to issue material');
    }
    setIssuing(null);
  }

  const visible = rows.filter(r => filter === 'ALL' || r.status === filter);
  const pendingCount = rows.filter(r => r.status === 'PENDING').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Rework Component Requests</h3>
          <p className="text-xs text-zinc-500 mt-0.5">Components requested against replacement / repair job cards (RTN)</p>
        </div>
        {pendingCount > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24' }}>
            {pendingCount} pending
          </span>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {(['PENDING', 'ISSUED', 'ALL'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${filter === f ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
            {f === 'ALL' ? 'All' : f === 'PENDING' ? 'Pending' : 'Issued'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-xs text-zinc-500 text-center py-6">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="text-center py-8">
          <Package className="w-5 h-5 text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-zinc-500">No {filter !== 'ALL' ? filter.toLowerCase() : ''} requests.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map(row => {
            const isPending = row.status === 'PENDING';
            const isLow = row.currentStock < row.qtyRequested;
            return (
              <div key={row.id} className="rounded-xl p-3" style={{
                background: isPending ? (isLow ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)') : 'rgba(34,197,94,0.04)',
                border:     isPending ? (isLow ? '1px solid rgba(239,68,68,0.2)' : '1px solid #27272a') : '1px solid rgba(34,197,94,0.15)',
              }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* RTN reference */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <a href={`/rework/${row.returnRequest.id}`} className="text-[10px] font-mono text-sky-400 hover:underline">
                        {row.returnRequest.returnNumber}
                      </a>
                      <span className="text-[10px] text-zinc-500">{row.returnRequest.client.customerName}</span>
                      {row.returnRequest.serialNumber && (
                        <span className="text-[10px] font-mono text-zinc-600">{row.returnRequest.serialNumber}</span>
                      )}
                    </div>
                    {/* Material */}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">{row.materialName}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isPending ? 'text-amber-400' : 'text-emerald-400'}`}
                        style={{ background: isPending ? 'rgba(251,191,36,0.1)' : 'rgba(34,197,94,0.1)' }}>
                        {isPending ? 'Pending' : 'Issued'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px]">
                      <span className="text-zinc-400">{row.qtyRequested} {row.unit} requested</span>
                      {isPending && (
                        <span className={isLow ? 'text-red-400 font-medium' : 'text-zinc-500'}>
                          {isLow ? 'Low Stock: ' : 'In Stock: '}{row.currentStock} {row.unit}
                        </span>
                      )}
                      {!isPending && row.issuedBy && (
                        <span className="text-zinc-500">Issued by {row.issuedBy.name}</span>
                      )}
                    </div>
                    {row.notes && <p className="text-[10px] text-zinc-500 mt-0.5">{row.notes}</p>}
                    <p className="text-[9px] text-zinc-600 mt-0.5">
                      Requested by {row.requestedBy.name} · {new Date(row.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>

                  {isPending && canIssue && (
                    <button
                      onClick={() => issue(row)}
                      disabled={issuing === row.id}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors"
                      style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22c55e' }}
                    >
                      {issuing === row.id ? '…' : 'Issue'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function InventoryPanel({ sessionRole }: { sessionRole: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('Materials');

  // canManageStock: can record GRN, do stock adjustments, create PRs
  const canManageStock     = ['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'].includes(sessionRole);
  // canManageMaterials: can create/edit/deactivate materials and categories
  const canManageMaterials = ['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'].includes(sessionRole);
  // Reports & BOM management: ADMIN only (not INVENTORY_MANAGER)
  const isAdmin = sessionRole === 'ADMIN';

  const canSeeRework = ['ADMIN', 'STORE_MANAGER', 'PRODUCTION_MANAGER'].includes(sessionRole);

  // INVENTORY_MANAGER sees: Materials, GRN, Settings (no Reports, no Rework)
  const canSeeJobCards = ['ADMIN', 'INVENTORY_MANAGER'].includes(sessionRole);

  const visibleTabs = TABS.filter(t => {
    if (t === 'Reports')   return isAdmin;
    if (t === 'Rework')    return canSeeRework;
    if (t === 'Job Cards') return canSeeJobCards;
    return true;
  });

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {visibleTabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab ? 'bg-sky-600 text-white shadow-lg' : 'text-zinc-400 hover:text-white'
            }`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Materials'  && <MaterialsTab isAdmin={canManageMaterials} />}
      {activeTab === 'GRN'        && <GRNTab       isAdmin={canManageStock} />}
      {activeTab === 'Job Cards'  && canSeeJobCards && <JobCardsTab sessionRole={sessionRole} />}
      {activeTab === 'Rework'     && canSeeRework && <ReworkTab canIssue={['ADMIN', 'STORE_MANAGER'].includes(sessionRole)} />}
      {activeTab === 'Reports'    && isAdmin && <ReportsTab isAdmin={true} />}
      {activeTab === 'Settings'   && <SettingsTab  isAdmin={canManageMaterials} />}
    </div>
  );
}
