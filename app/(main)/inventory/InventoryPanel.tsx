'use client';

import { useState, useEffect, useCallback } from 'react';

const TABS = ['Stock', 'GRN', 'Materials', 'Reports', 'Movements'] as const;
type Tab = typeof TABS[number];

interface RawMaterial {
  id: string; code: string; name: string; unit: string; active: boolean;
  description?: string | null; hsnCode?: string | null;
  purchasePrice?: number; leadTimeDays?: number;
  currentStock: number; minimumStock: number; reorderPoint: number;
  category?: { id: string; name: string } | null;
  preferredVendor?: { id: string; name: string } | null;
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

  const lowStockItems = (data?.materials ?? []).filter(m => m.isLowStock);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    setAddSaving(true);
    const inputQty = parseFloat(addQty);
    if (!addMat || isNaN(inputQty) || inputQty < 0) { setAddError('Enter a valid quantity'); setAddSaving(false); return; }
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
    if (res.ok) { setAddMat(null); setAddQty(''); setAddNotes(''); setAddPrice(''); setAddExpiryDate(''); load(); }
    else { const e = await res.json(); setAddError(e.error || 'Failed'); }
  }

  async function handleCreateAllPRs() {
    setReorderBusy(true); setReorderMsg('');
    const res = await fetch('/api/inventory/reorder-prs', { method: 'POST' });
    setReorderBusy(false);
    const data = await res.json();
    if (res.ok) setReorderMsg(`✓ Created ${data.created} PR${data.created !== 1 ? 's' : ''}`);
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

      {/* Reorder Alerts Panel */}
      {lowStockItems.length > 0 && (
        <div className="mb-5 rounded-xl border border-red-900/40 overflow-hidden" style={{ background: 'rgba(239,68,68,0.06)' }}>
          <div className="px-4 py-3 border-b border-red-900/30 flex items-center justify-between gap-3">
            <span className="text-red-400 text-sm font-medium">⚠ Reorder Alerts ({lowStockItems.length})</span>
            <div className="flex items-center gap-2">
              {reorderMsg && <span className="text-xs text-emerald-400">{reorderMsg}</span>}
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
                    {m.stockValue !== undefined && m.stockValue > 0 && <span className="text-zinc-400 text-xs">{fmtCur(m.stockValue)}</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                  {isAdmin && (
                    <>
                      <button onClick={() => { setAddMat(m); setAddType('OPENING'); setAddQty(''); setAddNotes(''); setAddPrice(''); }}
                        className="px-2 py-1 rounded-lg text-xs font-medium text-emerald-400 border border-emerald-700/50 hover:bg-emerald-700/20 transition-colors">
                        + Add
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
                            <th className="text-left pb-1">Label</th>
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
                              <td className="py-1 text-sky-400 font-mono">{b.batchCode}</td>
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
                              <td className="py-1">
                                <a href={`/print/grn-label/${b.id}`} target="_blank"
                                  className="text-purple-400 hover:text-purple-300 transition-colors">Print</a>
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
                              placeholder="0"
                              className="w-full mt-0.5 px-2 py-1.5 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                              style={{ background: 'rgb(39,39,42)' }} />
                          </div>
                          <div>
                            <label className="text-zinc-500 text-xs">Unit Price (₹)</label>
                            <input type="number" step="any" min="0" value={item.unitPrice}
                              onChange={e => setDrItems(prev => prev.map((r, i) => i === idx ? { ...r, unitPrice: e.target.value } : r))}
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
  const [fName,      setFName]      = useState('');
  const [fUnit,      setFUnit]      = useState('');
  const [fCatId,     setFCatId]     = useState('');
  const [fMin,       setFMin]       = useState('0');
  const [fReord,     setFReord]     = useState('0');
  const [fDesc,      setFDesc]      = useState('');
  const [fHsn,       setFHsn]       = useState('');
  const [fPrice,     setFPrice]     = useState('0');
  const [fLead,      setFLead]      = useState('0');
  const [fVendorId,  setFVendorId]  = useState('');
  const [fOpenQty,   setFOpenQty]   = useState('');
  const [fOpenPrice, setFOpenPrice] = useState('');
  const [fSaving,    setFSaving]    = useState(false);
  const [fError,     setFError]     = useState('');

  const [vendors,  setVendors]  = useState<Vendor[]>([]);
  const [cName,  setCName]  = useState('');
  const [cDesc,  setCDesc]  = useState('');
  const [cSaving,setCSaving]= useState(false);

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
    setEditMat(null); setFName(''); setFUnit(''); setFCatId(''); setFMin('0'); setFReord('0');
    setFDesc(''); setFHsn(''); setFPrice('0'); setFLead('0'); setFVendorId('');
    setFOpenQty(''); setFOpenPrice(''); setFError('');
    setShowMatForm(true);
  }

  function openEditMat(m: RawMaterial) {
    setEditMat(m); setFName(m.name); setFUnit(m.unit); setFCatId(m.category?.id ?? '');
    setFMin(String(m.minimumStock)); setFReord(String(m.reorderPoint));
    setFDesc(m.description ?? ''); setFHsn(m.hsnCode ?? '');
    setFPrice(String(m.purchasePrice ?? 0)); setFLead(String(m.leadTimeDays ?? 0));
    setFVendorId(m.preferredVendor?.id ?? ''); setFError('');
    setShowMatForm(true);
  }

  async function handleMatSubmit(e: React.FormEvent) {
    e.preventDefault(); setFError(''); setFSaving(true);
    const body = {
      name: fName, unit: fUnit, categoryId: fCatId || undefined,
      description: fDesc || undefined, hsnCode: fHsn || undefined,
      purchasePrice: parseFloat(fPrice || '0'), leadTimeDays: parseInt(fLead || '0'),
      preferredVendorId: fVendorId || undefined,
      minimumStock: parseFloat(fMin), reorderPoint: parseFloat(fReord),
    };
    const res = editMat
      ? await fetch(`/api/inventory/materials/${editMat.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/inventory/materials', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setFSaving(false);
    if (!res.ok) { const e = await res.json(); setFError(e.error || 'Failed'); return; }
    // For new material: if opening stock was entered, add it
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
            unitPrice: parseFloat(fOpenPrice || '0'),
          }),
        });
      }
    }
    setShowMatForm(false); load();
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
                {m.unit} · Min: {fmt(m.minimumStock)} · Reorder: {fmt(m.reorderPoint)}
                {m.hsnCode && <> · HSN: <span className="text-zinc-300">{m.hsnCode}</span></>}
                {m.preferredVendor && <> · Vendor: <span className="text-zinc-300">{m.preferredVendor.name}</span></>}
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
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-md rounded-2xl p-6 my-4" style={{ background: 'rgb(24,24,27)' }}>
            <h3 className="text-white font-semibold mb-4">{editMat ? 'Edit Material' : 'New Material'}</h3>
            <form onSubmit={handleMatSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
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
                  <label className="text-zinc-400 text-xs">HSN / SAC Code</label>
                  <input value={fHsn} onChange={e => setFHsn(e.target.value)} placeholder="e.g. 7318"
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                    style={{ background: 'rgb(39,39,42)' }} />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs">Default Purchase Price ₹</label>
                  <input type="number" step="any" min="0" value={fPrice} onChange={e => setFPrice(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                    style={{ background: 'rgb(39,39,42)' }} />
                </div>
                <div>
                  <label className="text-zinc-400 text-xs">Lead Time (days)</label>
                  <input type="number" min="0" value={fLead} onChange={e => setFLead(e.target.value)}
                    className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500"
                    style={{ background: 'rgb(39,39,42)' }} />
                </div>
              </div>
              <div>
                <label className="text-zinc-400 text-xs">Description</label>
                <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2}
                  placeholder="Optional description or specifications…"
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-sky-500 resize-none"
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
              <div>
                <label className="text-zinc-400 text-xs">Preferred Vendor</label>
                <select value={fVendorId} onChange={e => setFVendorId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700"
                  style={{ background: 'rgb(39,39,42)' }}>
                  <option value="">None</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
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
              {/* Opening stock — only for new materials */}
              {!editMat && (
                <div className="pt-2 border-t border-zinc-800">
                  <p className="text-zinc-400 text-xs mb-2">Opening Stock <span className="text-zinc-600">(optional)</span></p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-zinc-500 text-xs">Qty ({fUnit || 'unit'})</label>
                      <input type="number" step="any" min="0" value={fOpenQty} onChange={e => setFOpenQty(e.target.value)}
                        className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                        style={{ background: 'rgb(39,39,42)' }} placeholder="0" />
                    </div>
                    <div>
                      <label className="text-zinc-500 text-xs">Unit Price ₹</label>
                      <input type="number" step="any" min="0" value={fOpenPrice} onChange={e => setFOpenPrice(e.target.value)}
                        className="w-full mt-1 px-3 py-2 rounded-lg text-sm text-white border border-zinc-700 outline-none focus:border-emerald-500"
                        style={{ background: 'rgb(39,39,42)' }} placeholder="0.00" />
                    </div>
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
type ReportView = 'summary' | 'valuation' | 'reorder' | 'movements';

interface SummaryRow { id: string; code: string; name: string; unit: string; category?: { name: string } | null; openingQty: number; qtyIn: number; qtyOut: number; closingQty: number; stockValue: number; isLowStock: boolean; isCritical: boolean; }
interface ReorderRow { id: string; code: string; name: string; unit: string; category?: { name: string } | null; currentStock: number; reorderPoint: number; suggestedQty: number; leadTimeDays: number; preferredVendor?: { name: string } | null; hasPendingPR: boolean; isCritical: boolean; }

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

  useEffect(() => {
    if (view === 'summary' || view === 'valuation') loadSummary();
    if (view === 'reorder') loadReorder();
  }, [view, loadSummary, loadReorder]);

  async function handleCreateAllPRs() {
    setReorderBusy(true); setReorderMsg('');
    const res = await fetch('/api/inventory/reorder-prs', { method: 'POST' });
    setReorderBusy(false);
    const data = await res.json();
    if (res.ok) { setReorderMsg(`✓ Created ${data.created} PR${data.created !== 1 ? 's' : ''}`); loadReorder(); }
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
      <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {(['summary', 'valuation', 'reorder', 'movements'] as ReportView[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${view === v ? 'bg-sky-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
            {v === 'summary' ? 'Stock Summary' : v === 'valuation' ? 'Valuation' : v === 'reorder' ? 'Reorder' : 'Movements Log'}
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
                    <td className="px-3 py-2 text-right text-emerald-400">+{fmt(m.qtyIn)}</td>
                    <td className="px-3 py-2 text-right text-red-400">−{fmt(m.qtyOut)}</td>
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
              {reorderMsg && <span className="text-xs text-emerald-400">{reorderMsg}</span>}
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

      {/* MOVEMENTS LOG */}
      {view === 'movements' && <MovementsTab />}
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
      {activeTab === 'Reports'   && <ReportsTab   isAdmin={canManageMaterials} />}
      {activeTab === 'Movements' && <MovementsTab />}
    </div>
  );
}
