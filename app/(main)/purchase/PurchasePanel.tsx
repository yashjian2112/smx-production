'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, Star, X } from 'lucide-react';

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
  id: string; materialId?: string | null; qtyRequired: number;
  itemDescription?: string | null; itemUnit?: string | null;
  material?: { id: string; name: string; code: string; unit: string; aiPriceBenchmark?: number | null } | null;
  roItem: { id: string; qtyRequired: number; ro: { roNumber: string } };
};
type VendorInvite = { id: string; vendor: { id: string; name: string; code: string }; viewedAt?: string };
type Quote = {
  id: string; vendorId: string; currency: string; totalAmount: number; leadTimeDays: number;
  validUntil: string; notes?: string; status: string; submittedAt: string;
  sampleStatus: string;         // NONE, REQUESTED, APPROVED, REJECTED
  sampleRequestedAt?: string | null;
  sampleNotes?: string | null;
  vendor: { id: string; name: string; code: string; rating?: number | null };
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

type POItem = { id: string; rawMaterialId: string | null; itemDescription: string | null; itemUnit: string | null; quantity: number; unitPrice: number; receivedQuantity: number; rawMaterial: { name: string; unit: string } | null };
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

type VendorCat = { id: string; name: string; description?: string };
type VendorInvoiceForPR = { id: string; invoiceNumber: string; amount: number; gstAmount: number; tdsAmount: number; netAmount: number; status: string; fileUrl?: string };
type PaymentRequestRow = {
  id: string; requestNumber: string; status: string; aiVerified: boolean; aiVerificationNote?: string;
  requestedAt: string; notes?: string;
  po: { poNumber: string; totalAmount: number; currency: string; paidAmount: number; paymentStatus: string; vendor: { name: string }; rfq?: { rfqNumber: string; paymentTerms?: string } | null };
  vendorInvoice: { invoiceNumber: string; amount: number; netAmount: number };
  requestedBy: { name: string };
};

// Tabs are role-driven — PM sees procurement flow, IM sees approval queue
const PM_TABS   = ['Req. Orders', 'RFQ', 'Samples', 'Purchase Orders', 'Vendors', 'Payments'] as const;
const IM_TABS   = ['Req. Orders'] as const;
const ADMIN_TABS = ['Req. Orders', 'RFQ', 'Samples', 'Purchase Orders', 'Vendors', 'Payments'] as const;
type Tab = 'Req. Orders' | 'RFQ' | 'Samples' | 'Purchase Orders' | 'Vendors' | 'Payments';

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
  const [rfqFromRO, setRfqFromRO] = useState<RO | null>(null);

  function handleCreateRFQFromRO(ro: RO) {
    setRfqFromRO(ro);
    setTab('RFQ');
  }

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
      {tab === 'Req. Orders'    && <ROTab isIM={isIM} isPM={isPM} onCreateRFQFromRO={handleCreateRFQFromRO} />}
      {tab === 'RFQ'            && <RFQTab isPM={isPM} isIM={isIM} isAdmin={isAdmin} preselectedRO={rfqFromRO} onClearPreselected={() => setRfqFromRO(null)} />}
      {tab === 'Samples'        && <SamplesTab isPM={isPM} isAdmin={isAdmin} />}
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

function ROTab({ isIM, isPM, onCreateRFQFromRO }: { isIM: boolean; isPM: boolean; onCreateRFQFromRO?: (ro: RO) => void }) {
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
                    <button onClick={() => onCreateRFQFromRO?.(ro)}
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
   SAMPLES TAB
══════════════════════════════════════════════════════════════*/
type SampleRow = {
  id: string; rfqId: string; vendorId: string; currency: string; totalAmount: number;
  leadTimeDays: number; validUntil: string; status: string; submittedAt: string;
  sampleStatus: string; sampleRequestedAt?: string | null; sampleNotes?: string | null;
  vendor: { id: string; name: string; code: string };
  rfq: { id: string; rfqNumber: string; title: string; items: { material?: { name: string; unit: string } | null; itemDescription?: string | null }[] };
};

function SamplesTab({ isPM, isAdmin }: { isPM: boolean; isAdmin: boolean }) {
  const [rows, setRows] = useState<SampleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'REQUESTED' | 'APPROVED' | 'REJECTED'>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/procurement/samples');
    if (r.ok) setRows(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function sampleAction(rfqId: string, quoteId: string, action: 'approve' | 'reject') {
    const r = await fetch(`/api/procurement/rfq/${rfqId}/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId, action }),
    });
    if (r.ok) load();
    else { const e = await r.json(); alert(e.error); }
  }

  const filtered = filter === 'ALL' ? rows : rows.filter(r => r.sampleStatus === filter);

  const counts = {
    REQUESTED: rows.filter(r => r.sampleStatus === 'REQUESTED').length,
    APPROVED:  rows.filter(r => r.sampleStatus === 'APPROVED').length,
    REJECTED:  rows.filter(r => r.sampleStatus === 'REJECTED').length,
  };

  if (loading) return <div className="text-center text-zinc-500 py-12">Loading...</div>;

  return (
    <div>
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {([['REQUESTED','Awaiting Review','text-sky-400','border-sky-800/50'],['APPROVED','Approved','text-emerald-400','border-emerald-800/50'],['REJECTED','Rejected','text-red-400','border-red-800/50']] as const).map(([key,label,color,border]) => (
          <button key={key} onClick={() => setFilter(filter === key ? 'ALL' : key)}
            className={`rounded-xl border p-3 text-left transition-all ${filter === key ? 'bg-zinc-800' : 'bg-zinc-900/60'} ${border}`}>
            <div className={`text-2xl font-bold ${color}`}>{counts[key]}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center text-zinc-500 py-12">No samples{filter !== 'ALL' ? ` with status ${filter}` : ''}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(row => {
            const requestedAt = row.sampleRequestedAt ? new Date(row.sampleRequestedAt) : null;
            const hoursElapsed = requestedAt ? (Date.now() - requestedAt.getTime()) / 3_600_000 : 0;
            const canApprove = isAdmin || hoursElapsed >= 24;
            const hoursLeft = Math.ceil(24 - hoursElapsed);
            const sym = row.currency === 'USD' ? '$' : '₹';
            const materials = row.rfq.items.map(i => i.material?.name ?? i.itemDescription ?? '—').join(', ');

            return (
              <div key={row.id} className={`rounded-xl border p-4 ${
                row.sampleStatus === 'APPROVED' ? 'border-emerald-800/50 bg-emerald-950/10' :
                row.sampleStatus === 'REJECTED' ? 'border-zinc-800 bg-zinc-900/40' :
                'border-sky-800/50 bg-sky-950/10'}`}>
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-white text-sm font-semibold">{row.rfq.rfqNumber}</span>
                      <span className="text-zinc-300 text-sm">{row.rfq.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        row.sampleStatus === 'APPROVED' ? 'bg-emerald-900/50 text-emerald-300' :
                        row.sampleStatus === 'REJECTED' ? 'bg-zinc-800 text-zinc-400' :
                        'bg-sky-900/50 text-sky-300'}`}>
                        {row.sampleStatus}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-1">
                      <span className="text-zinc-300">{row.vendor.name}</span>
                      {' · '}{sym}{row.totalAmount.toLocaleString('en-IN')}
                      {' · '}{row.leadTimeDays}d lead
                      {' · '}{materials}
                    </div>
                    {row.sampleNotes && (
                      <div className="mt-1 text-xs text-zinc-400 italic">Note: {row.sampleNotes}</div>
                    )}
                    {requestedAt && (
                      <div className="text-xs text-zinc-600 mt-0.5">
                        Requested {requestedAt.toLocaleDateString('en-IN')} {requestedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {row.sampleStatus === 'REQUESTED' && !canApprove && <span className="ml-1 text-amber-500">· {hoursLeft}h until review</span>}
                      </div>
                    )}
                  </div>

                  {isPM && row.sampleStatus === 'REQUESTED' && (
                    canApprove ? (
                      <div className="flex gap-2">
                        <button onClick={() => sampleAction(row.rfq.id, row.id, 'approve')}
                          className="px-3 py-1.5 rounded-lg text-xs bg-emerald-700 hover:bg-emerald-600 text-white font-medium">
                          Approve
                        </button>
                        <button onClick={() => sampleAction(row.rfq.id, row.id, 'reject')}
                          className="px-3 py-1.5 rounded-lg text-xs bg-red-800 hover:bg-red-700 text-white">
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-500 self-center">Approve in {hoursLeft}h</span>
                    )
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

/* ═══════════════════════════════════════════════════════════
   RFQ TAB
══════════════════════════════════════════════════════════════*/
function RFQTab({ isPM, isIM, isAdmin, preselectedRO, onClearPreselected }: { isPM: boolean; isIM: boolean; isAdmin: boolean; preselectedRO?: RO | null; onClearPreselected?: () => void }) {
  const [rfqs, setRFQs] = useState<RFQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedRFQ, setSelectedRFQ] = useState<RFQ | null>(null);

  // Auto-open modal when arriving from RO card
  useEffect(() => {
    if (preselectedRO) { setCreating(true); }
  }, [preselectedRO]);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/procurement/rfq');
    if (r.ok) setRFQs(await r.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const [poModal, setPoModal] = useState<{ rfqId: string; quoteId: string; vendorName: string; deliveryDate: string } | null>(null);
  const [poSaving, setPoSaving] = useState(false);
  const [poError, setPoError] = useState('');

  function openCreatePO(rfqId: string, quote: Quote) {
    // Pre-fill delivery date from vendor's lead time
    const eta = new Date(new Date(quote.submittedAt).getTime() + quote.leadTimeDays * 86_400_000);
    const dateStr = eta.toISOString().split('T')[0];
    setPoModal({ rfqId, quoteId: quote.id, vendorName: quote.vendor.name, deliveryDate: dateStr });
    setPoError('');
  }

  async function confirmCreatePO() {
    if (!poModal) return;
    setPoSaving(true);
    setPoError('');
    const r = await fetch(`/api/procurement/rfq/${poModal.rfqId}/po`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedQuoteId: poModal.quoteId, expectedDelivery: poModal.deliveryDate }),
    });
    setPoSaving(false);
    if (r.ok) { setPoModal(null); load(); }
    else { const e = await r.json(); setPoError(e.error ?? 'Failed to create PO'); }
  }

  async function sampleAction(rfqId: string, quoteId: string, action: 'request' | 'approve' | 'reject', notes?: string) {
    const r = await fetch(`/api/procurement/rfq/${rfqId}/sample`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId, action, notes }),
    });
    if (r.ok) load();
    else { const e = await r.json(); alert(e.error); }
  }

  // Stats derived from rfq data
  const openCount = rfqs.filter(r => r.status === 'OPEN').length;
  const samplesInReview = rfqs.flatMap(r => r.quotes).filter(q => q.sampleStatus === 'REQUESTED').length;
  const quotesNeeded = rfqs.filter(r => r.status === 'OPEN' && r._count.quotes < 5).length;

  const [benchmarking, setBenchmarking] = useState<string | null>(null);
  const [benchmarks, setBenchmarks] = useState<Record<string, { price: number; confidence: string; notes: string }>>({});

  async function runBenchmark(materialId: string) {
    setBenchmarking(materialId);
    const r = await fetch('/api/procurement/ai-price-benchmark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ materialId }),
    });
    setBenchmarking(null);
    if (r.ok) {
      const data = await r.json();
      setBenchmarks(prev => ({ ...prev, [materialId]: { price: data.price, confidence: data.confidence, notes: data.notes } }));
    }
  }

  const [sampleNoteFor, setSampleNoteFor] = useState<{ rfqId: string; quoteId: string } | null>(null);
  const [sampleNoteText, setSampleNoteText] = useState('');

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

      {/* Stats strip */}
      {!loading && rfqs.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Open RFQs', value: openCount, color: 'text-green-400' },
            { label: 'Need More Quotes', value: quotesNeeded, color: 'text-amber-400' },
            { label: 'Samples in Review', value: samplesInReview, color: 'text-sky-400' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
            </div>
          ))}
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
                    <> · {rfq._count.vendorInvites} vendors · <span className={rfq._count.quotes >= 5 ? 'text-green-400' : 'text-amber-400'}>{rfq._count.quotes}/5 quotes</span></>
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
                        <span className="text-zinc-300">{item.material?.name ?? item.itemDescription ?? '—'}</span>
                        <span className="text-zinc-500">{item.qtyRequired} {item.material?.unit ?? item.itemUnit ?? 'unit'}</span>
                      </div>
                    ))}
                  </div>

                  {/* Quotes comparison */}
                  {rfq.quotes.length === 0 ? (
                    <div className="text-xs text-zinc-600 py-2">No quotes received yet</div>
                  ) : (
                    <div>
                      <div className="text-xs text-zinc-500 font-medium mb-2 uppercase tracking-wider">
                        Vendor Quote Comparison
                        <span className={`ml-2 normal-case ${rfq._count.quotes >= 5 ? 'text-green-400' : 'text-amber-400'}`}>
                          {rfq._count.quotes}/5 quotes
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-zinc-500 border-b border-zinc-800">
                              <th className="text-left pb-2 pr-3 w-6">#</th>
                              <th className="text-left pb-2 pr-3">Vendor</th>
                              <th className="text-right pb-2 pr-3">Total</th>
                              <th className="text-right pb-2 pr-3">Lead</th>
                              <th className="text-right pb-2 pr-3">Valid Until</th>
                              <th className="text-center pb-2 pr-3">Sample</th>
                              <th className="text-right pb-2">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rfq.quotes.sort((a, b) => a.totalAmount - b.totalAmount).map((q, idx) => {
                              const isLowest = idx === 0 && q.status === 'SUBMITTED';
                              const hasEnoughQuotes = rfq.quotes.length >= 5;
                              const sym = q.currency === 'USD' ? '$' : '₹';
                              const validUntil = new Date(q.validUntil);
                              const daysUntilExpiry = Math.ceil((validUntil.getTime() - Date.now()) / 86_400_000);
                              const isExpiringSoon = daysUntilExpiry <= 3 && daysUntilExpiry > 0;
                              const isExpired = daysUntilExpiry <= 0;

                              return (
                                <tr key={q.id} className={`border-b border-zinc-800/50 ${
                                  q.status === 'SELECTED' ? 'bg-green-950/20' :
                                  isLowest ? 'bg-amber-950/10' : ''}`}>
                                  <td className="py-2 pr-3 text-zinc-500">{idx + 1}</td>
                                  <td className="py-2 pr-3">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`font-medium ${isLowest ? 'text-amber-300' : 'text-white'}`}>{q.vendor.name}</span>
                                      {isLowest && <span className="text-xs px-1 py-0.5 rounded bg-amber-900/50 text-amber-300">Lowest</span>}
                                      {q.status === 'SELECTED' && <span className="text-xs px-1 py-0.5 rounded bg-green-900/50 text-green-300 flex items-center gap-0.5"><Check className="w-4 h-4 mr-1 inline" /> Selected</span>}
                                      {q.status === 'REJECTED' && <span className="text-xs text-zinc-600">Rejected</span>}
                                      {q.vendor.rating && <span className="text-xs text-yellow-400 flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400 inline" />{q.vendor.rating.toFixed(1)}</span>}
                                    </div>
                                    {q.notes && <div className="text-zinc-500 text-xs mt-0.5 max-w-xs truncate">{q.notes}</div>}
                                  </td>
                                  <td className="py-2 pr-3 text-right">
                                    <span className={`font-semibold ${isLowest ? 'text-amber-300' : 'text-white'}`}>
                                      {sym}{q.totalAmount.toLocaleString('en-IN')}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-3 text-right text-zinc-400">{q.leadTimeDays}d</td>
                                  <td className="py-2 pr-3 text-right">
                                    <span className={isExpired ? 'text-red-400' : isExpiringSoon ? 'text-amber-400' : 'text-zinc-400'}>
                                      {validUntil.toLocaleDateString('en-IN')}
                                      {isExpired && ' (expired)'}
                                      {isExpiringSoon && ` (${daysUntilExpiry}d)`}
                                    </span>
                                  </td>
                                  <td className="py-2 pr-3 text-center">
                                    {q.sampleStatus === 'NONE' ? <span className="text-zinc-700">—</span> :
                                     q.sampleStatus === 'REQUESTED' ? <span className="px-1.5 py-0.5 rounded bg-sky-900/50 text-sky-300">Requested</span> :
                                     q.sampleStatus === 'APPROVED'  ? <span className="px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 flex items-center gap-0.5"><Check className="w-4 h-4 mr-1 inline" /> Approved</span> :
                                     <span className="px-1.5 py-0.5 rounded bg-red-900/50 text-red-400">Rejected</span>}
                                  </td>
                                  <td className="py-2 text-right">
                                    {isPM && rfq.status === 'OPEN' && isLowest && (() => {
                                      if (!hasEnoughQuotes) {
                                        return <span className="text-zinc-600 text-xs">{rfq.quotes.length}/5 needed</span>;
                                      }
                                      if (q.sampleStatus === 'NONE' || q.sampleStatus === 'REJECTED') {
                                        return (
                                          <button onClick={() => { setSampleNoteFor({ rfqId: rfq.id, quoteId: q.id }); setSampleNoteText(''); }}
                                            className="px-2 py-1 rounded text-xs bg-sky-700 hover:bg-sky-600 text-white">
                                            Request Sample
                                          </button>
                                        );
                                      }
                                      if (q.sampleStatus === 'REQUESTED') {
                                        const requestedAt = q.sampleRequestedAt ? new Date(q.sampleRequestedAt) : null;
                                        const hoursElapsed = requestedAt ? (Date.now() - requestedAt.getTime()) / 3_600_000 : 0;
                                        const canApprove = isAdmin || hoursElapsed >= 24;
                                        const hoursLeft = Math.ceil(24 - hoursElapsed);
                                        return canApprove ? (
                                          <div className="flex gap-1">
                                            <button onClick={() => sampleAction(rfq.id, q.id, 'approve')}
                                              className="px-2 py-1 rounded text-xs bg-emerald-700 hover:bg-emerald-600 text-white"><Check className="w-4 h-4" /></button>
                                            <button onClick={() => sampleAction(rfq.id, q.id, 'reject')}
                                              className="px-2 py-1 rounded text-xs bg-red-800 hover:bg-red-700 text-white"><X className="w-4 h-4" /></button>
                                          </div>
                                        ) : (
                                          <span className="text-zinc-500 text-xs">{hoursLeft}h left</span>
                                        );
                                      }
                                      if (q.sampleStatus === 'APPROVED') {
                                        return (
                                          <button onClick={() => openCreatePO(rfq.id, q)}
                                            className="px-2 py-1 rounded text-xs bg-green-700 hover:bg-green-600 text-white font-medium">
                                            Create PO
                                          </button>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Per-item price breakdown */}
                      <div className="mt-3 pt-3 border-t border-zinc-800/50">
                        <div className="text-xs text-zinc-500 font-medium mb-2 uppercase tracking-wider">Price Breakdown per Item</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-zinc-600 border-b border-zinc-800">
                                <th className="text-left pb-1 pr-3">Material</th>
                                <th className="text-right pb-1 pr-3">Qty</th>
                                {rfq.quotes.slice().sort((a,b) => a.totalAmount - b.totalAmount).map(q => (
                                  <th key={q.id} className={`text-right pb-1 pr-3 ${q === rfq.quotes.slice().sort((a,b) => a.totalAmount - b.totalAmount)[0] ? 'text-amber-400' : ''}`}>
                                    {q.vendor.name.split(' ')[0]}
                                  </th>
                                ))}
                                <th className="text-right pb-1">AI Benchmark</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rfq.items.map(item => {
                                const sortedQuotes = rfq.quotes.slice().sort((a, b) => a.totalAmount - b.totalAmount);
                                return (
                                  <tr key={item.id} className="border-b border-zinc-800/30">
                                    <td className="py-1.5 pr-3 text-zinc-300">{item.material?.name ?? item.itemDescription ?? '—'}</td>
                                    <td className="py-1.5 pr-3 text-right text-zinc-500">{item.qtyRequired} {item.material?.unit ?? item.itemUnit ?? ''}</td>
                                    {sortedQuotes.map(q => {
                                      const qi = q.items.find(i => i.rfqItemId === item.id);
                                      return (
                                        <td key={q.id} className="py-1.5 pr-3 text-right text-zinc-300">
                                          {qi ? `₹${qi.unitPrice}/unit` : '—'}
                                        </td>
                                      );
                                    })}
                                    <td className="py-1.5 text-right">
                                      {item.materialId ? (
                                        benchmarks[item.materialId] ? (
                                          <span className={`font-medium ${
                                            benchmarks[item.materialId].confidence === 'HIGH' ? 'text-emerald-400' :
                                            benchmarks[item.materialId].confidence === 'LOW'  ? 'text-red-400' : 'text-yellow-400'}`}>
                                            ₹{benchmarks[item.materialId].price.toLocaleString('en-IN')}
                                          </span>
                                        ) : (
                                          <button onClick={() => runBenchmark(item.materialId!)}
                                            disabled={benchmarking === item.materialId}
                                            className="px-1.5 py-0.5 rounded text-xs bg-violet-800 hover:bg-violet-700 text-white disabled:opacity-50">
                                            {benchmarking === item.materialId ? '...' : 'AI Price'}
                                          </button>
                                        )
                                      ) : <span className="text-zinc-700">—</span>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && <CreateRFQModal preselectedRO={preselectedRO} onClose={() => { setCreating(false); onClearPreselected?.(); }} onCreated={() => { setCreating(false); onClearPreselected?.(); load(); }} />}

      {/* Create PO modal */}
      {poModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-white font-semibold">Create Purchase Order</h3>
            <p className="text-zinc-400 text-sm">
              Awarding to <span className="text-white font-medium">{poModal.vendorName}</span>
            </p>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Expected Delivery Date</label>
              <p className="text-xs text-zinc-500 mb-1.5">Pre-filled from vendor's lead time — edit if needed.</p>
              <input
                type="date"
                value={poModal.deliveryDate}
                onChange={e => setPoModal(prev => prev ? { ...prev, deliveryDate: e.target.value } : null)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
              />
            </div>
            {poError && <p className="text-red-400 text-xs">{poError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setPoModal(null)}
                className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700">
                Cancel
              </button>
              <button onClick={confirmCreatePO} disabled={poSaving || !poModal.deliveryDate}
                className="flex-1 py-2 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-medium disabled:opacity-50">
                {poSaving ? 'Creating…' : 'Confirm & Create PO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sample notes modal */}
      {sampleNoteFor && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-white font-semibold">Request Sample</h3>
            <p className="text-zinc-400 text-sm">Add any specific instructions for the vendor sample (e.g. quantity, finish, test requirements).</p>
            <textarea
              value={sampleNoteText}
              onChange={e => setSampleNoteText(e.target.value)}
              placeholder="e.g. Send 2 units, powder-coated finish, include test report…"
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-zinc-500"
            />
            <div className="flex gap-3">
              <button onClick={() => setSampleNoteFor(null)}
                className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700">
                Cancel
              </button>
              <button onClick={() => {
                sampleAction(sampleNoteFor.rfqId, sampleNoteFor.quoteId, 'request', sampleNoteText || undefined);
                setSampleNoteFor(null);
              }}
                className="flex-1 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium">
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CREATE RFQ MODAL
══════════════════════════════════════════════════════════════*/
function CreateRFQModal({ preselectedRO, onClose, onCreated }: { preselectedRO?: RO | null; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [category, setCategory] = useState('');
  const [fileUrls, setFileUrls] = useState<string[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorCategories, setVendorCategories] = useState<VendorCat[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [approvedROs, setApprovedROs] = useState<RO[]>([]);
  const [selectedROItems, setSelectedROItems] = useState<{ roItemId: string; materialId?: string; itemDescription?: string; itemUnit?: string; qtyRequired: number }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/procurement/requirement-orders?status=APPROVED').then(r => r.json()).then(setApprovedROs);
    fetch('/api/purchase/vendors').then(r => r.json()).then(v => setVendors(Array.isArray(v) ? v : []));
    fetch('/api/purchase/vendor-categories').then(r => r.json()).then(v => setVendorCategories(Array.isArray(v) ? v : []));
  }, []);

  // When category changes, clear vendor selection
  function handleCategoryChange(cat: string) {
    setCategory(cat);
    setSelectedVendors([]);
  }

  // Vendors filtered by selected category
  const filteredVendors = vendors.filter(v =>
    v.active && (!category || v.categories.includes(category))
  );

  // Pre-populate items from the RO that triggered this modal
  useEffect(() => {
    if (preselectedRO) {
      setSelectedROItems(preselectedRO.items.map(item => ({
        roItemId: item.id,
        materialId: item.materialId ?? undefined,
        itemDescription: item.itemDescription ?? undefined,
        itemUnit: item.itemUnit ?? undefined,
        qtyRequired: item.qtyRequired,
      })));
      setTitle(`RFQ for ${preselectedRO.roNumber}`);
    }
  }, [preselectedRO]);

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
    if (selectedVendors.length < 5) return alert(`Minimum 5 vendors required. You selected ${selectedVendors.length}.`);
    if (!selectedROItems.length) return alert('Select at least one RO item');
    setSaving(true);
    const r = await fetch('/api/procurement/rfq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, deadline: deadline || undefined, paymentTerms: paymentTerms || undefined, category: category || undefined, fileUrls, vendorIds: selectedVendors, roItems: selectedROItems }),
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
            <div>
              <label className="text-zinc-400 text-sm">Vendor Category *</label>
              <select value={category} onChange={e => handleCategoryChange(e.target.value)}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">All vendors (no category filter)</option>
                {vendorCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              {category && (
                <p className="text-xs text-zinc-500 mt-1">
                  Showing {filteredVendors.length} vendor{filteredVendors.length !== 1 ? 's' : ''} in this category
                </p>
              )}
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
              <label className="text-zinc-400 text-sm block mb-2">
                Select Vendors * <span className="text-zinc-600 font-normal">(min 5 required)</span>
              </label>
              {filteredVendors.length === 0 ? (
                <p className="text-xs text-amber-400">
                  {category
                    ? `No active vendors found in "${category}" category. Add vendors to this category first.`
                    : 'No active vendors found.'}
                </p>
              ) : (
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                  {filteredVendors.map(v => (
                    <label key={v.id} className="flex items-center gap-2 cursor-pointer py-1">
                      <input type="checkbox" checked={selectedVendors.includes(v.id)} onChange={() => toggleVendor(v.id)}
                        className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 accent-blue-500" />
                      <span className="text-sm text-zinc-300">{v.name}</span>
                      <span className="text-xs text-zinc-500">{v.code}</span>
                      {v.rating && <span className="text-xs text-amber-400 flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400 inline mr-1" />{v.rating}</span>}
                      <div className="flex gap-1 ml-auto">
                        {v.categories.map(c => <span key={c} className="text-xs bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">{c}</span>)}
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-1">
                {selectedVendors.length > 0 && (
                  <p className="text-xs text-zinc-500">{selectedVendors.length} selected</p>
                )}
                {selectedVendors.length > 0 && selectedVendors.length < 5 && (
                  <p className="text-xs text-amber-400">Need {5 - selectedVendors.length} more vendor{5 - selectedVendors.length > 1 ? 's' : ''}</p>
                )}
                {selectedVendors.length >= 5 && (
                  <p className="text-xs text-green-400 flex items-center gap-0.5"><Check className="w-4 h-4 mr-1 inline" /> Minimum met</p>
                )}
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
  const [uploadingInvoiceFor, setUploadingInvoiceFor] = useState<PO | null>(null);

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
                    {po.rfq && <> · RFQ: {po.rfq.rfqNumber}</>}
                    {po.rfq?.paymentTerms && <> · Terms: {po.rfq.paymentTerms}</>}
                  </div>
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <button onClick={() => window.open(`/print/purchase-order/${po.id}`, '_blank')}
                    className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 hover:border-zinc-500 px-2 py-1 rounded">
                    PDF
                  </button>
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
                  {isPM && ['GOODS_ARRIVED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(po.status) && po.vendorInvoices.length === 0 && (
                    <button onClick={() => setUploadingInvoiceFor(po)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-700 hover:bg-amber-600 text-white">
                      Upload Invoice
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
                    {po.items.length === 0 ? (
                      <div className="text-xs text-zinc-500 italic">No line items stored</div>
                    ) : po.items.map(item => {
                      const name = item.rawMaterial?.name ?? item.itemDescription ?? 'Custom Item';
                      const unit = item.rawMaterial?.unit ?? item.itemUnit ?? '';
                      return (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span className="text-zinc-300">{name}</span>
                          <span className="text-zinc-400">{item.receivedQuantity}/{item.quantity} {unit} received · ₹{item.unitPrice}/unit</span>
                        </div>
                      );
                    })}
                    {po.vendorInvoices.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-zinc-800">
                        <div className="text-xs text-zinc-500 font-medium mb-1 uppercase tracking-wider">Vendor Invoices</div>
                        {po.vendorInvoices.map(inv => (
                          <div key={inv.id} className="flex justify-between text-xs text-zinc-400">
                            <span className="font-mono">{inv.invoiceNumber}</span>
                            <span>₹{inv.netAmount.toLocaleString('en-IN')} net · <span className={inv.status === 'APPROVED' ? 'text-emerald-400' : 'text-amber-400'}>{inv.status}</span></span>
                          </div>
                        ))}
                      </div>
                    )}
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
      {uploadingInvoiceFor && <UploadVendorInvoiceModal po={uploadingInvoiceFor} onClose={() => setUploadingInvoiceFor(null)} onCreated={() => { setUploadingInvoiceFor(null); load(); }} />}
    </div>
  );
}

/* ─── GAN Modal ─────────────────────────────────────────── */
function GANModal({ po, onClose, onCreated }: { po: PO; onClose: () => void; onCreated: () => void }) {
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState(po.items.filter(i => i.rawMaterialId).map(i => ({ poItemId: i.id, materialId: i.rawMaterialId!, qtyArrived: i.quantity - i.receivedQuantity, name: i.rawMaterial?.name ?? i.itemDescription ?? 'Item', unit: i.rawMaterial?.unit ?? i.itemUnit ?? '' })));
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
  const [showCreate, setShowCreate] = useState(false);
  const [vendorCategories, setVendorCategories] = useState<VendorCat[]>([]);
  const [showCatPanel, setShowCatPanel] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [vr, cr] = await Promise.all([fetch('/api/purchase/vendors'), fetch('/api/purchase/vendor-categories')]);
    if (vr.ok) setVendors(await vr.json());
    if (cr.ok) setVendorCategories(await cr.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createCategory() {
    if (!newCatName.trim()) return;
    setCatSaving(true);
    const r = await fetch('/api/purchase/vendor-categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCatName.trim() }),
    });
    setCatSaving(false);
    if (r.ok) { setNewCatName(''); load(); }
    else { const e = await r.json(); alert(e.error); }
  }

  async function deleteCategory(name: string) {
    if (!confirm(`Delete category "${name}"?`)) return;
    await fetch('/api/purchase/vendor-categories', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      {/* Category management panel */}
      {(isPM || isAdmin) && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white text-sm font-semibold">Vendor Categories</span>
            <button onClick={() => setShowCatPanel(p => !p)}
              className="text-xs text-zinc-400 hover:text-white">{showCatPanel ? 'Hide' : 'Manage'}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {vendorCategories.length === 0
              ? <p className="text-xs text-zinc-600">No categories yet. Click Manage to add one.</p>
              : vendorCategories.map(c => (
                <span key={c.id} className="flex items-center gap-1 bg-zinc-800 text-zinc-300 text-xs px-2.5 py-1 rounded-full">
                  {c.name}
                  {showCatPanel && (
                    <button onClick={() => deleteCategory(c.name)}
                      className="text-zinc-600 hover:text-red-400 ml-1 leading-none">×</button>
                  )}
                </span>
              ))
            }
          </div>
          {showCatPanel && (
            <div className="flex gap-2 mt-3">
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                placeholder="New category name (e.g. VMC, CNC, Electrical)"
                onKeyDown={e => e.key === 'Enter' && createCategory()}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
              <button onClick={createCategory} disabled={catSaving || !newCatName.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
                {catSaving ? '...' : '+ Add'}
              </button>
            </div>
          )}
        </div>
      )}

      {(isPM || isAdmin) && (
        <div className="flex justify-end">
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white">
            + Add Vendor
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-zinc-500 py-12">Loading...</div>
      ) : vendors.length === 0 ? (
        <div className="text-center text-zinc-500 py-12">
          <p className="text-sm">No vendors yet.</p>
          <p className="text-xs mt-1 text-zinc-600">Add at least 5 vendors before creating an RFQ.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {vendors.map(v => (
            <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-semibold">{v.name}</span>
                    <span className="text-zinc-500 text-xs">{v.code}</span>
                    {v.rating && <span className="text-xs text-amber-400 flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400 inline mr-1" />{v.rating}</span>}
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
                        Portal: {v.portalEmail} {v.isPortalActive ? <><Check className="w-4 h-4 mr-1 inline" /> Active</> : '(Inactive)'}
                      </span>
                    ) : <span className="text-zinc-600">No portal access</span>}
                  </div>
                </div>
                {(isPM || isAdmin) && (
                  <button onClick={() => setEditPortal(v)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 shrink-0">
                    Portal Access
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editPortal && (
        <PortalAccessModal
          vendor={editPortal}
          vendorCategories={vendorCategories}
          onClose={() => setEditPortal(null)}
          onSaved={() => { setEditPortal(null); load(); }}
        />
      )}
      {showCreate && (
        <CreateVendorModal
          vendorCategories={vendorCategories}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CREATE VENDOR MODAL
══════════════════════════════════════════════════════════════*/
function CreateVendorModal({ vendorCategories, onClose, onCreated }: { vendorCategories: VendorCat[]; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  // Portal credentials
  const [portalEmail, setPortalEmail] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleCat(name: string) {
    setSelectedCats(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
  }

  async function submit() {
    if (!name.trim()) return alert('Vendor name is required');
    if (portalEmail && !portalPassword) return alert('Set a portal password for this vendor');
    setSaving(true);
    const r = await fetch('/api/purchase/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        contactPerson: contactPerson.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        gstNumber: gstNumber.trim() || undefined,
        categories: selectedCats,
        portalEmail: portalEmail.trim() || undefined,
        portalPassword: portalPassword || undefined,
      }),
    });
    setSaving(false);
    if (r.ok) onCreated();
    else { const e = await r.json(); alert(e.error ?? 'Failed to create vendor'); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-white font-semibold text-lg mb-4">Add New Vendor</h2>
          <div className="space-y-3">
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wider">Vendor Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. ABC Electronics Pvt Ltd"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs uppercase tracking-wider">Contact Person</label>
                <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Name"
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-zinc-400 text-xs uppercase tracking-wider">Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210"
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 text-xs uppercase tracking-wider">Business Email</label>
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="vendor@email.com" type="email"
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-zinc-400 text-xs uppercase tracking-wider">GST Number</label>
                <input value={gstNumber} onChange={e => setGstNumber(e.target.value)} placeholder="27AABCU9603R1ZX"
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wider">Address</label>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Full address"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>

            {/* Categories */}
            <div>
              <label className="text-zinc-400 text-xs uppercase tracking-wider">Supply Categories</label>
              {vendorCategories.length === 0 ? (
                <p className="text-xs text-zinc-600 mt-1">No categories defined. Add categories in the Vendors tab first.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {vendorCategories.map(c => (
                    <button key={c.id} type="button" onClick={() => toggleCat(c.name)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        selectedCats.includes(c.name)
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                      }`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Portal Access */}
            <div className="border-t border-zinc-800 pt-3">
              <label className="text-zinc-400 text-xs uppercase tracking-wider">Portal Access (optional)</label>
              <p className="text-xs text-zinc-600 mt-0.5 mb-2">Set login credentials so this vendor can access the portal</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-500 text-xs">Portal Login Email</label>
                  <input value={portalEmail} onChange={e => setPortalEmail(e.target.value)} type="email"
                    placeholder="login@vendor.com"
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-zinc-500 text-xs">Portal Password</label>
                  <input value={portalPassword} onChange={e => setPortalPassword(e.target.value)} type="password"
                    placeholder="Min 6 characters"
                    className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700">Cancel</button>
            <button onClick={submit} disabled={saving} className="flex-1 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Vendor'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   UPLOAD VENDOR INVOICE MODAL
══════════════════════════════════════════════════════════════*/
function UploadVendorInvoiceModal({ po, onClose, onCreated }: { po: PO; onClose: () => void; onCreated: () => void }) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [gstAmount, setGstAmount] = useState('0');
  const [tdsAmount, setTdsAmount] = useState('0');
  const [fileUrl, setFileUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/procurement/upload', { method: 'POST', body: fd });
    setUploading(false);
    if (r.ok) { const d = await r.json(); setFileUrl(d.url); }
    else alert('Upload failed');
  }

  async function submit() {
    if (!invoiceNumber.trim()) return alert('Invoice number required');
    if (!amount || isNaN(Number(amount))) return alert('Valid amount required');
    setSaving(true);
    const r = await fetch(`/api/procurement/purchase-orders/${po.id}/vendor-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoiceNumber: invoiceNumber.trim(),
        amount: Number(amount),
        gstAmount: Number(gstAmount) || 0,
        tdsAmount: Number(tdsAmount) || 0,
        fileUrl: fileUrl || undefined,
      }),
    });
    setSaving(false);
    if (r.ok) { onCreated(); }
    else { const e = await r.json(); alert(e.error); }
  }

  const net = (Number(amount) || 0) + (Number(gstAmount) || 0) - (Number(tdsAmount) || 0);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md">
        <div className="p-6">
          <h2 className="text-white font-semibold text-lg mb-1">Upload Vendor Invoice</h2>
          <p className="text-zinc-500 text-sm mb-4">PO: {po.poNumber} · {po.vendor.name}</p>
          <div className="space-y-3">
            <div>
              <label className="text-zinc-400 text-sm">Invoice Number *</label>
              <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="e.g. VIN/2025/001"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-zinc-400 text-xs">Amount (₹) *</label>
                <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0" placeholder="0"
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">GST (₹)</label>
                <input value={gstAmount} onChange={e => setGstAmount(e.target.value)} type="number" min="0" placeholder="0"
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="text-zinc-400 text-xs">TDS (₹)</label>
                <input value={tdsAmount} onChange={e => setTdsAmount(e.target.value)} type="number" min="0" placeholder="0"
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            {amount && <div className="text-xs text-zinc-400">Net payable: <span className="text-white font-medium">₹{net.toLocaleString('en-IN')}</span></div>}
            <div>
              <label className="text-zinc-400 text-sm">Attach Invoice (PDF/Image)</label>
              <input type="file" accept=".pdf,image/*" onChange={uploadFile} disabled={uploading}
                className="w-full mt-1 text-sm text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:bg-zinc-700 file:text-white file:text-xs cursor-pointer" />
              {uploading && <p className="text-xs text-zinc-500 mt-1">Uploading...</p>}
              {fileUrl && <p className="text-xs text-emerald-400 mt-1 flex items-center gap-0.5"><Check className="w-4 h-4 mr-1 inline" /> File uploaded</p>}
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
            <button onClick={submit} disabled={saving || uploading}
              className="flex-1 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Invoice'}
            </button>
          </div>
        </div>
      </div>
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

function PortalAccessModal({ vendor, vendorCategories, onClose, onSaved }: {
  vendor: Vendor; vendorCategories: VendorCat[]; onClose: () => void; onSaved: () => void;
}) {
  const [email, setEmail] = useState(vendor.portalEmail ?? '');
  const [password, setPassword] = useState('');
  const [active, setActive] = useState(vendor.isPortalActive);
  const [selectedCats, setSelectedCats] = useState<string[]>(vendor.categories);
  const [saving, setSaving] = useState(false);

  function toggleCat(name: string) {
    setSelectedCats(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
  }

  async function submit() {
    if (!email) return alert('Portal email required');
    if (!vendor.portalEmail && !password) return alert('Password required for new portal access');
    setSaving(true);
    const r = await fetch(`/api/procurement/vendors/${vendor.id}/portal-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        portalEmail: email,
        password: password || undefined,
        isPortalActive: active,
        categories: selectedCats,
      }),
    });
    setSaving(false);
    if (r.ok) onSaved();
    else { const e = await r.json(); alert(e.error); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-white font-semibold text-lg mb-1">Portal Access</h2>
          <p className="text-zinc-500 text-sm mb-4">{vendor.name} · {vendor.code}</p>
          <div className="space-y-3">
            <div>
              <label className="text-zinc-400 text-sm">Portal Login Email *</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email"
                placeholder="login@vendor.com"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-sm">
                Password {vendor.portalEmail ? <span className="text-zinc-600">(leave blank to keep current)</span> : '*'}
              </label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password"
                placeholder={vendor.portalEmail ? '••••••••' : 'Set a password'}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-zinc-400 text-sm block mb-2">Supply Categories</label>
              {vendorCategories.length === 0
                ? <p className="text-xs text-zinc-600">No categories defined yet.</p>
                : (
                  <div className="flex flex-wrap gap-2">
                    {vendorCategories.map(c => (
                      <button key={c.id} type="button" onClick={() => toggleCat(c.name)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          selectedCats.includes(c.name)
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500'
                        }`}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}
                className="w-4 h-4 rounded accent-blue-500" />
              <span className="text-sm text-zinc-300">Portal Active (vendor can log in)</span>
            </label>
          </div>
          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-sm">Cancel</button>
            <button onClick={submit} disabled={saving}
              className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Access'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
