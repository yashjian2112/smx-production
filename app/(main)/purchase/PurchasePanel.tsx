'use client';

import { useState, useEffect, useCallback } from 'react';

/* ─── Types ─────────────────────────────────────────────────────── */
type ROItem = {
  id: string; materialId?: string | null; itemDescription?: string | null; itemUnit?: string | null;
  qtyRequired: number; qtyOrdered: number; notes?: string;
  material?: { id: string; name: string; code: string; unit: string; currentStock: number; minimumOrderQty: number } | null;
};
type RO = {
  id: string; roNumber: string; trigger: string; status: string; notes?: string;
  createdAt: string; approvedAt?: string;
  approvedBy?: { name: string };
  jobCard?: { cardNumber: string };
  items: ROItem[];
};

type RFQItem = {
  id: string; materialId: string; qtyRequired: number;
  material: { id: string; name: string; code: string; unit: string };
  roItem: { id: string; qtyRequired: number; ro: { roNumber: string } };
};
type VendorInvite = { id: string; vendor: { id: string; name: string; code: string }; viewedAt?: string };
type Quote = {
  id: string; vendorId: string; currency: string; totalAmount: number; leadTimeDays: number;
  validUntil: string; notes?: string; status: string; submittedAt: string;
  vendor: { id: string; name: string; code: string };
  items: { id: string; rfqItemId: string; materialId: string; unitPrice: number; totalPrice: number; currency: string }[];
};
type RFQ = {
  id: string; rfqNumber: string; title: string; description?: string;
  fileUrls: string[]; deadline?: string; status: string; createdAt: string;
  createdBy: { name: string };
  items: RFQItem[];
  vendorInvites: VendorInvite[];
  quotes: Quote[];
  _count: { quotes: number; vendorInvites: number };
};

type POItem = { id: string; rawMaterialId: string; quantity: number; unitPrice: number; receivedQuantity: number; rawMaterial: { name: string; unit: string } };
type GAN = { id: string; ganNumber: string; arrivalDate: string; status: string; notes?: string; items: { id: string; materialId: string; qtyArrived: number; material: { name: string; unit: string } }[]; grn?: { id: string; grnNumber: string } };
type PO = {
  id: string; poNumber: string; status: string; totalAmount: number; currency: string;
  paidAmount: number; paymentStatus: string;
  expectedDelivery?: string; notes?: string; approvedAt?: string; createdAt: string;
  vendor: { id: string; name: string; code: string };
  createdBy: { name: string };
  approvedBy?: { name: string };
  rfq?: { rfqNumber: string; title: string; paymentTerms?: string } | null;
  items: POItem[];
  goodsArrivals: GAN[];
  vendorInvoices: VendorInvoiceForPR[];
  paymentRequest?: { id: string; requestNumber: string; status: string } | null;
};

type Vendor = {
  id: string; code: string; name: string; email?: string; phone?: string;
  portalEmail?: string; isPortalActive: boolean; categories: string[]; rating?: number;
  active: boolean;
};

type VendorInvoiceForPR = { id: string; invoiceNumber: string; amount: number; gstAmount: number; tdsAmount: number; netAmount: number; status: string };
type PaymentRequestRow = {
  id: string; requestNumber: string; status: string; aiVerified: boolean; aiVerificationNote?: string;
  requestedAt: string; notes?: string;
  po: { poNumber: string; totalAmount: number; currency: string; paidAmount: number; paymentStatus: string; vendor: { name: string }; rfq?: { rfqNumber: string; paymentTerms?: string } | null };
  vendorInvoice: { invoiceNumber: string; amount: number; netAmount: number };
  requestedBy: { name: string };
};

// Tabs are role-driven — PM sees procurement flow, IM sees approval queue
const PM_TABS   = ['Req. Orders', 'RFQ', 'Purchase Orders', 'Vendors', 'Payments'] as const;
const IM_TABS   = ['Req. Orders'] as const;
const ADMIN_TABS = ['Req. Orders', 'RFQ', 'Purchase Orders', 'Vendors', 'Payments'] as const;
type Tab = 'Req. Orders' | 'RFQ' | 'Purchase Orders' | 'Vendors' | 'Payments';

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
  APPROVED: 'bg-blue-900/40 text-blue-300 border border-blue-700/50',
  CONVERTED: 'bg-purple-900/40 text-purple-300 border border-purple-700/50',
  CANCELLED: 'bg-zinc-800 text-zinc-400',
  DRAFT: 'bg-zinc-800 text-zinc-400',
  OPEN: 'bg-green-900/40 text-green-300 border border-green-700/50',
  CLOSED: 'bg-zinc-800 text-zinc-400',
  GOODS_ARRIVED: 'bg-orange-900/40 text-orange-300 border border-orange-700/50',
  PARTIALLY_RECEIVED: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/50',
  RECEIVED: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
  SENT: 'bg-cyan-900/40 text-cyan-300 border border-cyan-700/50',
  GRN_DONE: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
  CREATED: 'bg-orange-900/40 text-orange-300 border border-orange-700/50',
  LOW_STOCK: 'bg-red-900/40 text-red-300 border border-red-700/40',
  JOB_CARD: 'bg-violet-900/40 text-violet-300 border border-violet-700/40',
  MANUAL: 'bg-zinc-800 text-zinc-400',
};

function Badge({ label }: { label: string }) {
  const cls = STATUS_COLOR[label] ?? 'bg-zinc-800 text-zinc-400';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label.replace(/_/g, ' ')}</span>;
}

export default function PurchasePanel({ sessionRole }: { sessionRole: string }) {
  const isPM   = ['ADMIN', 'PURCHASE_MANAGER'].includes(sessionRole);
  const isIM   = ['ADMIN', 'INVENTORY_MANAGER', 'STORE_MANAGER'].includes(sessionRole);
  const isAdmin = sessionRole === 'ADMIN';

  const tabs: readonly Tab[] = isAdmin ? ADMIN_TABS : isPM ? PM_TABS : IM_TABS;
  const [tab, setTab] = useState<Tab>(tabs[0]);

  return (
    <div>
      {tabs.length > 1 && (
        <div className="flex gap-1 mb-6 bg-zinc-900 rounded-xl p-1">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              {t}
            </button>
          ))}
        </div>
      )}
      {tab === 'Req. Orders'    && <ROTab isIM={isIM} isPM={isPM} onGoToRFQ={() => setTab('RFQ')} />}
      {tab === 'RFQ'            && <RFQTab isPM={isPM} isIM={isIM} />}
      {tab === 'Purchase Orders' && <POTab isPM={isPM} isIM={isIM} />}
      {tab === 'Vendors'        && <VendorsTab isAdmin={isAdmin} isPM={isPM} />}
      {tab === 'Payments'       && <PaymentsTab isPM={isPM} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   REQUIREMENT ORDERS TAB
══════════════════════════════════════════════════════════════*/
/* ─── Manual RO Modal ──────────────────────────────────────────────────────── */
type MatOption = { id: string; name: string; code: string; unit: string; minimumOrderQty: number; currentStock: number };
type ManualItem = {
  type: 'inventory' | 'custom';
  materialId: string; matSearch: string;
  itemDescription: string; itemUnit: string;
  qtyRequired: string; notes: string;
};

const BLANK_ITEM = (): ManualItem => ({ type: 'inventory', materialId: '', matSearch: '', itemDescription: '', itemUnit: 'pcs', qtyRequired: '', notes: '' });

function CreateManualROModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ManualItem[]>([BLANK_ITEM()]);
  const [saving, setSaving] = useState(false);
  const [materials, setMaterials] = useState<MatOption[]>([]);

  useEffect(() => {
    fetch('/api/inventory/materials').then(r => r.ok ? r.json() : []).then((list: MatOption[]) => setMaterials(list));
  }, []);

  function addItem() { setItems(p => [...p, BLANK_ITEM()]); }
  function removeItem(i: number) { setItems(p => p.filter((_, idx) => idx !== i)); }
  function update(i: number, patch: Partial<ManualItem>) {
    setItems(p => p.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }

  function selectedMat(item: ManualItem) {
    return materials.find(m => m.id === item.materialId) ?? null;
  }

  function filteredMats(item: ManualItem) {
    const q = item.matSearch.toLowerCase();
    return materials.filter(m => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)).slice(0, 8);
  }

  async function submit() {
    for (const it of items) {
      if (it.type === 'inventory') {
        if (!it.materialId) return alert('Select a material from the list for all inventory items');
        const mat = selectedMat(it);
        const qty = Number(it.qtyRequired);
        if (!qty || qty <= 0) return alert('Quantity must be > 0');
        if (mat && qty < mat.minimumOrderQty) return alert(`Qty for "${mat.name}" cannot be less than MOQ (${mat.minimumOrderQty} ${mat.unit})`);
      } else {
        if (!it.itemDescription.trim()) return alert('Fill description for all custom items');
        if (!it.qtyRequired || Number(it.qtyRequired) <= 0) return alert('Quantity must be > 0');
      }
    }
    setSaving(true);
    const r = await fetch('/api/procurement/requirement-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: notes.trim() || undefined,
        items: items.map(it => it.type === 'inventory'
          ? { materialId: it.materialId, qtyRequired: Number(it.qtyRequired), notes: it.notes.trim() || undefined }
          : { itemDescription: it.itemDescription.trim(), itemUnit: it.itemUnit.trim() || 'pcs', qtyRequired: Number(it.qtyRequired), notes: it.notes.trim() || undefined }
        ),
      }),
    });
    setSaving(false);
    if (r.ok) { onCreated(); onClose(); }
    else { const e = await r.json(); alert(e.error); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-zinc-800">
          <h3 className="font-semibold text-white">New Requirement Order</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-4 flex-1">
          <div>
            <label className="text-xs text-zinc-400 uppercase tracking-wide mb-1 block">Purpose / Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="e.g. Monthly maintenance supplies, office consumables..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-blue-500" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-zinc-400 uppercase tracking-wide">Items</label>
              <button onClick={addItem} className="text-xs text-blue-400 hover:text-blue-300">+ Add item</button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => {
                const mat = selectedMat(item);
                const moqWarn = item.type === 'inventory' && mat && item.qtyRequired && Number(item.qtyRequired) < mat.minimumOrderQty;
                return (
                  <div key={i} className="bg-zinc-800/60 border border-zinc-700 rounded-xl p-3 space-y-2">
                    {/* Type toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex rounded-lg overflow-hidden border border-zinc-600 text-xs">
                        <button onClick={() => update(i, { type: 'inventory', materialId: '', matSearch: '' })}
                          className={`px-3 py-1 ${item.type === 'inventory' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>
                          From List
                        </button>
                        <button onClick={() => update(i, { type: 'custom' })}
                          className={`px-3 py-1 ${item.type === 'custom' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-400'}`}>
                          Custom
                        </button>
                      </div>
                      {items.length > 1 && (
                        <button onClick={() => removeItem(i)} className="text-zinc-500 hover:text-red-400 text-lg leading-none">×</button>
                      )}
                    </div>

                    {item.type === 'inventory' ? (
                      <>
                        {/* Material search/select */}
                        <div className="relative">
                          <input
                            value={mat ? `${mat.code} — ${mat.name}` : item.matSearch}
                            onChange={e => update(i, { matSearch: e.target.value, materialId: '' })}
                            onFocus={e => { if (mat) { e.target.select(); update(i, { matSearch: '', materialId: '' }); } }}
                            placeholder="Search material by name or code..."
                            className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
                          {!item.materialId && item.matSearch && (
                            <div className="absolute z-10 w-full mt-1 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl max-h-44 overflow-y-auto">
                              {filteredMats(item).length === 0
                                ? <div className="px-3 py-2 text-xs text-zinc-500">No materials found</div>
                                : filteredMats(item).map(m => (
                                  <button key={m.id} onClick={() => update(i, { materialId: m.id, matSearch: '', qtyRequired: String(m.minimumOrderQty) })}
                                    className="w-full text-left px-3 py-2 hover:bg-zinc-700 text-sm">
                                    <span className="text-white">{m.name}</span>
                                    <span className="text-zinc-500 ml-2 text-xs">{m.code}</span>
                                    <span className="text-zinc-500 ml-2 text-xs">MOQ: {m.minimumOrderQty} {m.unit}</span>
                                    <span className="text-zinc-600 ml-2 text-xs">Stock: {m.currentStock}</span>
                                  </button>
                                ))
                              }
                            </div>
                          )}
                        </div>
                        {mat && (
                          <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <span>Unit: <span className="text-zinc-300">{mat.unit}</span></span>
                            <span>·</span>
                            <span>MOQ: <span className="text-zinc-300">{mat.minimumOrderQty}</span></span>
                            <span>·</span>
                            <span>Stock: <span className="text-zinc-300">{mat.currentStock}</span></span>
                          </div>
                        )}
                        <input type="number" min={mat?.minimumOrderQty ?? 0.01} step="any" value={item.qtyRequired}
                          onChange={e => update(i, { qtyRequired: e.target.value })}
                          onWheel={e => e.currentTarget.blur()}
                          placeholder={mat ? `Min ${mat.minimumOrderQty} ${mat.unit}` : 'Qty required'}
                          className={`w-full bg-zinc-700 border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none ${moqWarn ? 'border-red-500' : 'border-zinc-600 focus:border-blue-500'}`} />
                        {moqWarn && <p className="text-xs text-red-400">Qty must be ≥ MOQ ({mat!.minimumOrderQty} {mat!.unit})</p>}
                      </>
                    ) : (
                      <>
                        <input value={item.itemDescription} onChange={e => update(i, { itemDescription: e.target.value })}
                          placeholder="Description (e.g. WD-40 spray, M6 bolts)"
                          className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
                        <div className="flex gap-2">
                          <input type="number" min="0.01" step="any" value={item.qtyRequired}
                            onChange={e => update(i, { qtyRequired: e.target.value })}
                            onWheel={e => e.currentTarget.blur()}
                            placeholder="Qty"
                            className="w-24 bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
                          <input value={item.itemUnit} onChange={e => update(i, { itemUnit: e.target.value })}
                            placeholder="Unit (pcs, kg, ltr...)"
                            className="flex-1 bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
                        </div>
                      </>
                    )}
                    <input value={item.notes} onChange={e => update(i, { notes: e.target.value })}
                      placeholder="Item notes (optional)"
                      className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="px-5 pb-5 pt-3 border-t border-zinc-800 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
            {saving ? 'Creating...' : 'Create RO'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ROTab({ isIM, isPM, onGoToRFQ }: { isIM: boolean; isPM: boolean; onGoToRFQ?: () => void }) {
  const [ros, setROs] = useState<RO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const q = filter !== 'ALL' ? `?status=${filter}` : '';
    const r = await fetch(`/api/procurement/requirement-orders${q}`);
    if (r.ok) setROs(await r.json());
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function approve(id: string) {
    const r = await fetch(`/api/procurement/requirement-orders/${id}/approve`, { method: 'POST' });
    if (r.ok) load();
    else { const e = await r.json(); alert(e.error); }
  }

  const filters = ['ALL', 'PENDING', 'APPROVED', 'CONVERTED', 'CANCELLED'];

  return (
    <div>
      {showCreate && <CreateManualROModal onClose={() => setShowCreate(false)} onCreated={load} />}

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${filter === f ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}>
              {f}
            </button>
          ))}
        </div>
        {isIM && (
          <button onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white">
            + Manual RO
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center text-zinc-500 py-12">Loading...</div>
      ) : ros.length === 0 ? (
        <div className="text-center text-zinc-500 py-12">No requirement orders{filter !== 'ALL' ? ` with status ${filter}` : ''}</div>
      ) : (
        <div className="space-y-3">
          {ros.map(ro => (
            <div key={ro.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-white font-semibold">{ro.roNumber}</span>
                    {ro.status !== 'APPROVED' && <Badge label={ro.status} />}
                    <Badge label={ro.trigger} />
                    {ro.jobCard && <span className="text-xs text-zinc-500">Job: {ro.jobCard.cardNumber}</span>}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {new Date(ro.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {ro.approvedBy && <> · Approved by {ro.approvedBy.name}</>}
                  </div>
                  {ro.notes && <div className="text-xs text-zinc-400 mt-1">{ro.notes}</div>}
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <button onClick={() => setExpanded(expanded === ro.id ? null : ro.id)}
                    className="text-xs text-blue-400 hover:text-blue-300">
                    {expanded === ro.id ? 'Hide' : `${ro.items.length} item${ro.items.length !== 1 ? 's' : ''}`}
                  </button>
                  <a href={`/print/ro/${ro.id}`} target="_blank" rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-700 hover:bg-zinc-600 text-white">
                    PDF
                  </a>
                  {isIM && ro.status === 'PENDING' && (
                    <button onClick={() => approve(ro.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-700 hover:bg-green-600 text-white">
                      Approve
                    </button>
                  )}
                  {isPM && ro.status === 'APPROVED' && (
                    <button onClick={onGoToRFQ}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white">
                      Create RFQ →
                    </button>
                  )}
                </div>
              </div>

              {expanded === ro.id && (
                <div className="mt-3 border-t border-zinc-800 pt-3 space-y-2">
                  {ro.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-white">
                          {item.material ? item.material.name : item.itemDescription}
                        </span>
                        {item.material && <span className="text-zinc-500 ml-2 text-xs">{item.material.code}</span>}
                      </div>
                      <div className="text-right text-xs">
                        <span className="text-amber-300">
                          {item.qtyRequired} {item.material ? item.material.unit : item.itemUnit} needed
                        </span>
                        {item.material && <span className="text-zinc-500 ml-2">Stock: {item.material.currentStock}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   RFQ TAB
══════════════════════════════════════════════════════════════*/
function RFQTab({ isPM, isIM }: { isPM: boolean; isIM: boolean }) {
  const [rfqs, setRFQs] = useState<RFQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedRFQ, setSelectedRFQ] = useState<RFQ | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/procurement/rfq');
    if (r.ok) setRFQs(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createPO(rfqId: string, quoteId: string) {
    const delivery = prompt('Expected delivery date (YYYY-MM-DD):');
    if (!delivery) return;
    const r = await fetch(`/api/procurement/rfq/${rfqId}/po`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedQuoteId: quoteId, expectedDelivery: delivery }),
    });
    if (r.ok) { load(); alert('Purchase Order created!'); }
    else { const e = await r.json(); alert(e.error); }
  }

  return (
    <div>
      {isPM && (
        <div className="mb-4 flex justify-end">
          <button onClick={() => setCreating(true)}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium">
            + Create RFQ
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-500 py-12">Loading...</div>
      ) : rfqs.length === 0 ? (
        <div className="text-center text-zinc-500 py-12">No RFQs yet</div>
      ) : (
        <div className="space-y-3">
          {rfqs.map(rfq => (
            <div key={rfq.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-white font-semibold">{rfq.rfqNumber}</span>
                    <Badge label={rfq.status} />
                    <span className="text-sm text-zinc-300">{rfq.title}</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {new Date(rfq.createdAt).toLocaleDateString('en-IN')} · By {rfq.createdBy.name}
                    {rfq.deadline && <> · Deadline: {new Date(rfq.deadline).toLocaleDateString('en-IN')}</>}
                    <> · {rfq._count.vendorInvites} vendors · {rfq._count.quotes} quotes</>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  {rfq.fileUrls.length > 0 && (
                    <span className="text-xs text-blue-400">{rfq.fileUrls.length} file{rfq.fileUrls.length !== 1 ? 's' : ''}</span>
                  )}
                  <button onClick={() => setExpanded(expanded === rfq.id ? null : rfq.id)}
                    className="text-xs text-blue-400 hover:text-blue-300">
                    {expanded === rfq.id ? 'Hide' : 'Quotes'}
                  </button>
                </div>
              </div>

              {expanded === rfq.id && (
                <div className="mt-4 border-t border-zinc-800 pt-4">
                  {/* Items */}
                  <div className="mb-3">
                    <div className="text-xs text-zinc-500 font-medium mb-2 uppercase tracking-wider">Materials Required</div>
                    {rfq.items.map(item => (
                      <div key={item.id} className="flex justify-between text-sm py-1">
                        <span className="text-zinc-300">{item.material.name}</span>
                        <span className="text-zinc-500">{item.qtyRequired} {item.material.unit}</span>
                      </div>
                    ))}
                  </div>

                  {/* Quotes comparison */}
                  {rfq.quotes.length === 0 ? (
                    <div className="text-xs text-zinc-600 py-2">No quotes received yet</div>
                  ) : (
                    <div>
                      <div className="text-xs text-zinc-500 font-medium mb-2 uppercase tracking-wider">Vendor Quotes</div>
                      <div className="space-y-2">
                        {rfq.quotes.sort((a, b) => a.totalAmount - b.totalAmount).map((q, idx) => (
                          <div key={q.id} className={`p-3 rounded-lg border ${q.status === 'SELECTED' ? 'border-green-600 bg-green-950/40' : idx === 0 && q.status === 'SUBMITTED' ? 'border-amber-600/50 bg-amber-950/20' : 'border-zinc-700 bg-zinc-800'}`}>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div>
                                <span className="text-white font-medium">{q.vendor.name}</span>
                                {idx === 0 && q.status === 'SUBMITTED' && <span className="ml-2 text-xs text-amber-300">Lowest</span>}
                                {q.status === 'SELECTED' && <span className="ml-2 text-xs text-green-300">✓ Selected</span>}
                                {q.status === 'REJECTED' && <span className="ml-2 text-xs text-zinc-500">Rejected</span>}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-white font-semibold">
                                  {q.currency === 'USD' ? '$' : '₹'}{q.totalAmount.toLocaleString('en-IN')}
                                </span>
                                <span className="text-xs text-zinc-400">{q.leadTimeDays}d lead</span>
                                {isPM && rfq.status === 'OPEN' && q.status === 'SUBMITTED' && (
                                  <button onClick={() => createPO(rfq.id, q.id)}
                                    className="px-3 py-1 rounded-lg text-xs bg-green-700 hover:bg-green-600 text-white">
                                    Create PO
                                  </button>
                                )}
                              </div>
                            </div>
                            {/* Per-item pricing */}
                            {q.items.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-zinc-700 space-y-1">
                                {q.items.map(qi => {
                                  const rfqItem = rfq.items.find(ri => ri.id === qi.rfqItemId);
                                  return (
                                    <div key={qi.id} className="flex justify-between text-xs text-zinc-400">
                                      <span>{rfqItem?.material.name ?? qi.materialId}</span>
                                      <span>{q.currency === 'USD' ? '$' : '₹'}{qi.unitPrice} × {rfqItem?.qtyRequired} = {q.currency === 'USD' ? '$' : '₹'}{qi.totalPrice.toFixed(2)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && <CreateRFQModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CREATE RFQ MODAL
══════════════════════════════════════════════════════════════*/
function CreateRFQModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [approvedROs, setApprovedROs] = useState<RO[]>([]);
  const [selectedROItems, setSelectedROItems] = useState<{ roItemId: string; materialId?: string; itemDescription?: string; itemUnit?: string; qtyRequired: number }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/procurement/requirement-orders?status=APPROVED').then(r => r.json()).then(setApprovedROs);
    fetch('/api/purchase/vendors').then(r => r.json()).then(v => setVendors(Array.isArray(v) ? v : []));
  }, []);

  function toggleVendor(id: string) {
    setSelectedVendors(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  }

  function toggleROItem(item: ROItem) {
    const key = item.id;
    setSelectedROItems(prev => {
      const exists = prev.find(i => i.roItemId === key);
      if (exists) return prev.filter(i => i.roItemId !== key);
      return [...prev, {
        roItemId: key,
        materialId: item.materialId ?? undefined,
        itemDescription: item.itemDescription ?? undefined,
        itemUnit: item.itemUnit ?? undefined,
        qtyRequired: item.qtyRequired,
      }];
    });
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/procurement/upload', { method: 'POST', body: fd });
      if (r.ok) { const d = await r.json(); setFileUrls(prev => [...prev, d.url]); }
    }
  }

  async function submit() {
    if (!title.trim()) return alert('Title required');
    if (!selectedVendors.length) return alert('Select at least one vendor');
    if (!selectedROItems.length) return alert('Select at least one RO item');
    setSaving(true);
    const r = await fetch('/api/procurement/rfq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, deadline: deadline || undefined, paymentTerms: paymentTerms || undefined, fileUrls, vendorIds: selectedVendors, roItems: selectedROItems }),
    });
    setSaving(false);
    if (r.ok) onCreated();
    else { const e = await r.json(); alert(e.error); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-white font-semibold text-lg mb-4">Create RFQ</h2>

          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 text-sm">Title *</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. IGBTs and Capacitors Q1 2026"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-sm">Description (optional)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            <div>
              <label className="text-zinc-400 text-sm">Deadline (optional)</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-sm">Payment Terms</label>
              <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">Select terms</option>
                <option value="Net 30">Net 30</option>
                <option value="Net 45">Net 45</option>
                <option value="Net 60">Net 60</option>
                <option value="50% Advance + 50% on Delivery">50% Advance + 50% on Delivery</option>
                <option value="100% Advance">100% Advance</option>
                <option value="30% Advance + 70% on Delivery">30% Advance + 70% on Delivery</option>
              </select>
            </div>

            {/* File uploads */}
            <div>
              <label className="text-zinc-400 text-sm">Drawings / Spec Files</label>
              <input type="file" multiple accept=".pdf,.dwg,.dxf,.jpg,.png" onChange={handleFileUpload}
                className="w-full mt-1 text-zinc-400 text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-zinc-700 file:text-white hover:file:bg-zinc-600" />
              {fileUrls.length > 0 && (
                <div className="mt-2 space-y-1">
                  {fileUrls.map((u, i) => <div key={i} className="text-xs text-blue-400 truncate">{u}</div>)}
                </div>
              )}
            </div>

            {/* RO Items */}
            <div>
              <label className="text-zinc-400 text-sm block mb-2">Select Materials (from Approved ROs) *</label>
              {approvedROs.length === 0 ? (
                <p className="text-xs text-zinc-600">No approved ROs. Approve ROs first.</p>
              ) : (
                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                  {approvedROs.map(ro => (
                    <div key={ro.id}>
                      <div className="text-xs text-zinc-500 mb-1">{ro.roNumber}</div>
                      {ro.items.map(item => (
                        <label key={item.id} className="flex items-center gap-2 cursor-pointer py-1">
                          <input type="checkbox"
                            checked={!!selectedROItems.find(i => i.roItemId === item.id)}
                            onChange={() => toggleROItem(item)}
                            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-blue-500" />
                          <span className="text-sm text-zinc-300">{item.material?.name ?? item.itemDescription}</span>
                          <span className="text-xs text-zinc-500">{item.qtyRequired} {item.material?.unit ?? item.itemUnit}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vendors */}
            <div>
              <label className="text-zinc-400 text-sm block mb-2">Select Vendors *</label>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {vendors.filter(v => v.active).map(v => (
                  <label key={v.id} className="flex items-center gap-2 cursor-pointer py-1">
                    <input type="checkbox" checked={selectedVendors.includes(v.id)} onChange={() => toggleVendor(v.id)}
                      className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-blue-500" />
                    <span className="text-sm text-zinc-300">{v.name}</span>
                    <span className="text-xs text-zinc-500">{v.code}</span>
                    {v.rating && <span className="text-xs text-amber-400">★ {v.rating}</span>}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Creating...' : 'Create RFQ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PURCHASE ORDERS TAB
══════════════════════════════════════════════════════════════*/
function POTab({ isPM, isIM }: { isPM: boolean; isIM: boolean }) {
  const [pos, setPOs] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creatingGAN, setCreatingGAN] = useState<PO | null>(null);
  const [creatingGRN, setCreatingGRN] = useState<{ po: PO; gan: GAN } | null>(null);
  const [creatingPR, setCreatingPR] = useState<PO | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/procurement/purchase-orders');
    if (r.ok) setPOs(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {loading ? (
        <div className="text-center text-zinc-500 py-12">Loading...</div>
      ) : pos.length === 0 ? (
        <div className="text-center text-zinc-500 py-12">No purchase orders yet. Create POs from RFQ quotes.</div>
      ) : (
        <div className="space-y-3">
          {pos.map(po => (
            <div key={po.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-white font-semibold">{po.poNumber}</span>
                    <Badge label={po.status} />
                    <span className="text-sm text-zinc-400">{po.vendor.name}</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {po.currency === 'USD' ? '$' : '₹'}{po.totalAmount.toLocaleString('en-IN')} ·
                    {po.expectedDelivery && <> ETA: {new Date(po.expectedDelivery).toLocaleDateString('en-IN')} ·</>}
                    {po.rfq && <> RFQ: {po.rfq.rfqNumber}</>}
                  </div>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <button onClick={() => setExpanded(expanded === po.id ? null : po.id)}
                    className="text-xs text-blue-400 hover:text-blue-300">
                    {expanded === po.id ? 'Hide' : 'Details'}
                  </button>
                  {isPM && ['APPROVED', 'SENT', 'CONFIRMED'].includes(po.status) && (
                    <button onClick={() => setCreatingGAN(po)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-orange-700 hover:bg-orange-600 text-white">
                      Goods Arrived
                    </button>
                  )}
                  {isPM && ['RECEIVED', 'PARTIALLY_RECEIVED'].includes(po.status) && !po.paymentRequest && po.vendorInvoices.length > 0 && (
                    <button onClick={() => setCreatingPR(po)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-700 hover:bg-violet-600 text-white">
                      Payment Request
                    </button>
                  )}
                  {po.paymentRequest && (
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${po.paymentRequest.status === 'PAID' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-violet-900/40 text-violet-300'}`}>
                      {po.paymentRequest.requestNumber}: {po.paymentRequest.status.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              </div>

              {expanded === po.id && (
                <div className="mt-3 border-t border-zinc-800 pt-3">
                  {/* PO Items */}
                  <div className="mb-3 space-y-1">
                    {po.items.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="text-zinc-300">{item.rawMaterial.name}</span>
                        <span className="text-zinc-400">{item.receivedQuantity}/{item.quantity} {item.rawMaterial.unit} received · ₹{item.unitPrice}/unit</span>
                      </div>
                    ))}
                  </div>

                  {/* GANs */}
                  {po.goodsArrivals.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-zinc-800">
                      <div className="text-xs text-zinc-500 font-medium mb-2 uppercase tracking-wider">Goods Arrivals</div>
                      {po.goodsArrivals.map(gan => (
                        <div key={gan.id} className="flex items-center justify-between bg-zinc-800 rounded-lg p-3 mb-2">
                          <div>
                            <span className="text-white font-mono text-sm">{gan.ganNumber}</span>
                            <span className="ml-2"><Badge label={gan.status} /></span>
                            <div className="text-xs text-zinc-500 mt-1">{new Date(gan.arrivalDate).toLocaleDateString('en-IN')}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            {gan.grn ? (
                              <span className="text-xs text-emerald-400">GRN: {gan.grn.grnNumber}</span>
                            ) : isIM ? (
                              <button onClick={() => setCreatingGRN({ po, gan })}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white">
                                Create GRN
                              </button>
                            ) : <span className="text-xs text-zinc-500">Awaiting GRN</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {creatingGAN && <GANModal po={creatingGAN} onClose={() => setCreatingGAN(null)} onCreated={() => { setCreatingGAN(null); load(); }} />}
      {creatingGRN && <GRNModal po={creatingGRN.po} gan={creatingGRN.gan} onClose={() => setCreatingGRN(null)} onCreated={() => { setCreatingGRN(null); load(); }} />}
      {creatingPR && <CreatePaymentRequestModal po={creatingPR} onClose={() => setCreatingPR(null)} onCreated={() => { setCreatingPR(null); load(); }} />}
    </div>
  );
}

/* ─── GAN Modal ─────────────────────────────────────────── */
function GANModal({ po, onClose, onCreated }: { po: PO; onClose: () => void; onCreated: () => void }) {
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(po.items.map(i => ({ poItemId: i.id, materialId: i.rawMaterialId, qtyArrived: i.quantity - i.receivedQuantity, name: i.rawMaterial.name, unit: i.rawMaterial.unit })));
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const r = await fetch(`/api/procurement/purchase-orders/${po.id}/gan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes, items: items.map(i => ({ poItemId: i.poItemId, materialId: i.materialId, qtyArrived: i.qtyArrived })) }),
    });
    setSaving(false);
    if (r.ok) onCreated();
    else { const e = await r.json(); alert(e.error); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg">
        <div className="p-6">
          <h2 className="text-white font-semibold text-lg mb-4">Goods Arrival Note — {po.poNumber}</h2>
          <div className="space-y-3 mb-4">
            {items.map((item, i) => (
              <div key={item.poItemId} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-zinc-300">{item.name}</span>
                <input type="number" min={0} value={item.qtyArrived}
                  onChange={e => { const n = [...items]; n[i].qtyArrived = parseFloat(e.target.value) || 0; setItems(n); }}
                  onWheel={e => (e.target as HTMLInputElement).blur()}
                  className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm text-right focus:outline-none focus:border-blue-500" />
                <span className="text-xs text-zinc-500 w-10">{item.unit}</span>
              </div>
            ))}
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)..." rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm mb-4 focus:outline-none focus:border-blue-500 resize-none" />
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="flex-1 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Create GAN'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── GRN Modal ─────────────────────────────────────────── */
function GRNModal({ po, gan, onClose, onCreated }: { po: PO; gan: GAN; onClose: () => void; onCreated: () => void }) {
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(gan.items.map(i => ({ ganItemId: i.id, poItemId: po.items.find(p => p.rawMaterialId === i.materialId)?.id ?? '', materialId: i.materialId, qtyVerified: i.qtyArrived, qtyRejected: 0, unitPrice: po.items.find(p => p.rawMaterialId === i.materialId)?.unitPrice ?? 0, name: i.material.name, unit: i.material.unit })));
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const r = await fetch(`/api/procurement/purchase-orders/${po.id}/grn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ganId: gan.id, notes, items: items.map(i => ({ ganItemId: i.ganItemId, poItemId: i.poItemId, materialId: i.materialId, qtyVerified: i.qtyVerified, qtyRejected: i.qtyRejected, unitPrice: i.unitPrice })) }),
    });
    setSaving(false);
    if (r.ok) { onCreated(); alert('GRN created — stock updated!'); }
    else { const e = await r.json(); alert(e.error); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg">
        <div className="p-6">
          <h2 className="text-white font-semibold text-lg mb-1">Create GRN</h2>
          <p className="text-zinc-500 text-sm mb-4">Against GAN: {gan.ganNumber}</p>
          <div className="space-y-3 mb-4">
            {items.map((item, i) => (
              <div key={item.materialId}>
                <div className="text-sm text-zinc-300 mb-1">{item.name}</div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-zinc-500">Verified Qty</label>
                    <input type="number" min={0} max={item.qtyVerified} value={item.qtyVerified}
                      onChange={e => { const n = [...items]; n[i].qtyVerified = parseFloat(e.target.value) || 0; setItems(n); }}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-zinc-500">Rejected Qty</label>
                    <input type="number" min={0} value={item.qtyRejected}
                      onChange={e => { const n = [...items]; n[i].qtyRejected = parseFloat(e.target.value) || 0; setItems(n); }}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div className="w-16 text-center">
                    <label className="text-xs text-zinc-500">Unit ₹</label>
                    <input type="number" min={0} value={item.unitPrice}
                      onChange={e => { const n = [...items]; n[i].unitPrice = parseFloat(e.target.value) || 0; setItems(n); }}
                      onWheel={e => (e.target as HTMLInputElement).blur()}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Verification notes..." rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm mb-4 focus:outline-none focus:border-blue-500 resize-none" />
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Create GRN + Update Stock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   VENDORS TAB
══════════════════════════════════════════════════════════════*/
function VendorsTab({ isAdmin, isPM }: { isAdmin: boolean; isPM: boolean }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPortal, setEditPortal] = useState<Vendor | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/purchase/vendors');
    if (r.ok) setVendors(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {loading ? (
        <div className="text-center text-zinc-500 py-12">Loading...</div>
      ) : (
        <div className="space-y-3">
          {vendors.map(v => (
            <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-semibold">{v.name}</span>
                    <span className="text-zinc-500 text-xs">{v.code}</span>
                    {v.rating && <span className="text-xs text-amber-400">★ {v.rating}</span>}
                    {!v.active && <Badge label="INACTIVE" />}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {v.email && <span>{v.email} · </span>}
                    {v.phone && <span>{v.phone}</span>}
                  </div>
                  {v.categories.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {v.categories.map(c => <span key={c} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{c}</span>)}
                    </div>
                  )}
                  <div className="text-xs mt-1">
                    {v.portalEmail ? (
                      <span className={v.isPortalActive ? 'text-green-400' : 'text-zinc-500'}>
                        Portal: {v.portalEmail} {v.isPortalActive ? '(Active)' : '(Inactive)'}
                      </span>
                    ) : <span className="text-zinc-600">No portal access</span>}
                  </div>
                </div>
                {isPM && (
                  <button onClick={() => setEditPortal(v)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700">
                    Portal Access
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editPortal && <PortalAccessModal vendor={editPortal} onClose={() => setEditPortal(null)} onSaved={() => { setEditPortal(null); load(); }} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CREATE PAYMENT REQUEST MODAL
══════════════════════════════════════════════════════════════*/
function CreatePaymentRequestModal({ po, onClose, onCreated }: { po: PO; onClose: () => void; onCreated: () => void }) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(po.vendorInvoices[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!selectedInvoiceId) return alert('Select a vendor invoice');
    setSaving(true);
    const r = await fetch('/api/procurement/payment-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poId: po.id, vendorInvoiceId: selectedInvoiceId, notes: notes || undefined }),
    });
    setSaving(false);
    if (r.ok) { onCreated(); alert('Payment request created!'); }
    else { const e = await r.json(); alert(e.error); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md">
        <div className="p-6">
          <h2 className="text-white font-semibold text-lg mb-1">Create Payment Request</h2>
          <p className="text-zinc-500 text-sm mb-4">PO: {po.poNumber} · {po.vendor.name}</p>
          <div className="space-y-3">
            <div>
              <label className="text-zinc-400 text-sm">Vendor Invoice *</label>
              <select value={selectedInvoiceId} onChange={e => setSelectedInvoiceId(e.target.value)}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                {po.vendorInvoices.map(inv => (
                  <option key={inv.id} value={inv.id}>
                    {inv.invoiceNumber} — ₹{inv.netAmount.toLocaleString('en-IN')} (net)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-zinc-400 text-sm">Notes (optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PAYMENTS TAB
══════════════════════════════════════════════════════════════*/
function PaymentsTab({ isPM }: { isPM: boolean }) {
  const [requests, setRequests] = useState<PaymentRequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const PAYMENT_STATUS_COLOR: Record<string, string> = {
    SUBMITTED: 'bg-zinc-800 text-zinc-400',
    UNDER_REVIEW: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700/50',
    PENDING_APPROVAL: 'bg-amber-900/40 text-amber-300 border border-amber-700/50',
    APPROVED: 'bg-blue-900/40 text-blue-300 border border-blue-700/50',
    PROCESSING: 'bg-cyan-900/40 text-cyan-300 border border-cyan-700/50',
    PAID: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50',
    REJECTED: 'bg-red-900/40 text-red-300 border border-red-700/50',
  };

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/procurement/payment-requests');
    if (r.ok) setRequests(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submitToAccounts(id: string) {
    const r = await fetch(`/api/procurement/payment-requests/${id}/submit-to-accounts`, { method: 'POST' });
    if (r.ok) load();
    else { const e = await r.json(); alert(e.error); }
  }

  if (loading) return <div className="text-center text-zinc-500 py-12">Loading...</div>;

  return (
    <div>
      {requests.length === 0 ? (
        <div className="text-center text-zinc-500 py-12">No payment requests yet</div>
      ) : (
        <div className="space-y-3">
          {requests.map(pr => (
            <div key={pr.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-white font-semibold">{pr.requestNumber}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PAYMENT_STATUS_COLOR[pr.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                      {pr.status.replace(/_/g, ' ')}
                    </span>
                    {pr.aiVerified ? (
                      <span className="text-xs text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-700/40">AI Verified</span>
                    ) : (
                      <span className="text-xs text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded border border-amber-700/40">Review Needed</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {pr.po.poNumber} · {pr.po.vendor.name} · Invoice: {pr.vendorInvoice.invoiceNumber}
                    {pr.po.rfq?.paymentTerms && <> · Terms: <span className="text-zinc-300">{pr.po.rfq.paymentTerms}</span></>}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    Net: ₹{pr.vendorInvoice.netAmount.toLocaleString('en-IN')} · Requested by {pr.requestedBy.name}
                  </div>
                  {pr.aiVerificationNote && (
                    <div className="text-xs text-zinc-600 mt-1 italic">{pr.aiVerificationNote}</div>
                  )}
                </div>
                <div className="flex gap-2 items-center">
                  {isPM && pr.status === 'SUBMITTED' && (
                    <button onClick={() => submitToAccounts(pr.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-700 hover:bg-blue-600 text-white">
                      Submit to Accounts
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PortalAccessModal({ vendor, onClose, onSaved }: { vendor: Vendor; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState(vendor.portalEmail ?? '');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(vendor.isPortalActive);
  const [categories, setCategories] = useState(vendor.categories.join(', '));
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!email) return alert('Email required');
    setSaving(true);
    const r = await fetch(`/api/procurement/vendors/${vendor.id}/portal-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portalEmail: email,
        password: password || undefined,
        isPortalActive: active,
        categories: categories.split(',').map(s => s.trim()).filter(Boolean),
      }),
    });
    setSaving(false);
    if (r.ok) onSaved();
    else { const e = await r.json(); alert(e.error); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm">
        <div className="p-6">
          <h2 className="text-white font-semibold text-lg mb-4">Portal Access — {vendor.name}</h2>
          <div className="space-y-3">
            <div>
              <label className="text-zinc-400 text-sm">Portal Email *</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-sm">New Password {vendor.portalEmail ? '(leave blank to keep)' : '*'}</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-sm">Supply Categories (comma-separated)</label>
              <input value={categories} onChange={e => setCategories(e.target.value)} placeholder="IGBTs, Capacitors, Resistors"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500" />
              <span className="text-sm text-zinc-300">Portal Active</span>
            </label>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
