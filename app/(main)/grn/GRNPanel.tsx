'use client';

import { useState, useEffect, useCallback } from 'react';
import { Package, Check, X, ChevronDown, ChevronUp } from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────── */
interface GANItem {
  id: string;
  poItemId: string;
  materialId: string;
  qtyArrived: number;
  material: { id: string; name: string; unit: string };
}

interface POItem {
  id: string;
  rawMaterialId: string;
  quantity: number;
  unitPrice: number;
  receivedQuantity: number;
  rawMaterial: { id: string; name: string; unit: string; code: string } | null;
  itemDescription: string | null;
  itemUnit: string | null;
}

interface PendingGAN {
  id: string;
  ganNumber: string;
  arrivalDate: string;
  notes: string | null;
  createdBy: { name: string };
  po: {
    id: string;
    poNumber: string;
    status: string;
    vendor: { id: string; name: string; code: string };
    items: POItem[];
  };
  items: GANItem[];
}

interface GRNItem {
  id: string;
  quantity: number;
  unitPrice: number;
  condition: string;
  rawMaterial: { name: string; unit: string; code: string };
  poItem?: { quantity: number; receivedQuantity: number } | null;
}

interface GRN {
  id: string;
  grnNumber: string;
  receivedAt: string;
  notes?: string;
  receivedBy: { name: string };
  purchaseOrder: {
    poNumber: string;
    vendor: { name: string; code: string };
    purchaseRequest?: { requestNumber: string } | null;
  };
  items: GRNItem[];
  batches: { id: string; batchCode: string; quantity: number; remainingQty: number; condition: string }[];
}

/* ─── Helpers ──────────────────────────────────────────────── */
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const map: Record<string, string> = {
    red: 'bg-red-900/30 text-red-400',
    yellow: 'bg-yellow-900/30 text-yellow-400',
    green: 'bg-emerald-900/30 text-emerald-400',
    sky: 'bg-sky-900/30 text-sky-400',
    orange: 'bg-orange-900/30 text-orange-400',
    zinc: 'bg-zinc-800 text-zinc-400',
  };
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${map[color] ?? map.zinc}`}>{children}</span>;
}

/* ─── Main Panel ────────────────────────────────────────────── */
const TABS = ['Pending', 'Completed'] as const;
type Tab = typeof TABS[number];

export default function GRNPanel() {
  const [tab, setTab] = useState<Tab>('Pending');
  const [pendingGANs, setPendingGANs] = useState<PendingGAN[]>([]);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [loading, setLoading] = useState(true);
  const [grnModal, setGrnModal] = useState<PendingGAN | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [pendRes, grnRes] = await Promise.all([
      fetch('/api/inventory/grn/pending'),
      fetch('/api/inventory/grn'),
    ]);
    if (pendRes.ok) setPendingGANs(await pendRes.json());
    if (grnRes.ok) setGrns(await grnRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              tab === t ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            {t}
            {t === 'Pending' && pendingGANs.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-amber-900/40 text-amber-400">{pendingGANs.length}</span>
            )}
            {t === 'Completed' && grns.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-700 text-zinc-400">{grns.length}</span>
            )}
          </button>
        ))}
      </div>

      {loading && <p className="text-zinc-400 text-sm py-6 text-center">Loading...</p>}

      {!loading && tab === 'Pending' && <PendingTab gans={pendingGANs} onCreateGRN={setGrnModal} />}
      {!loading && tab === 'Completed' && <CompletedTab grns={grns} />}

      {grnModal && (
        <GRNModal
          gan={grnModal}
          onClose={() => setGrnModal(null)}
          onCreated={() => { setGrnModal(null); load(); }}
        />
      )}
    </div>
  );
}

/* ─── Pending Tab ───────────────────────────────────────────── */
function PendingTab({ gans, onCreateGRN }: { gans: PendingGAN[]; onCreateGRN: (g: PendingGAN) => void }) {
  if (gans.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-400 text-sm">No pending goods arrivals</p>
        <p className="text-zinc-600 text-xs mt-1">GRN requests appear here when Purchase Manager logs a GAN</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {gans.map(gan => (
        <div key={gan.id} className="rounded-xl border border-amber-900/30 overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-amber-400 font-mono font-medium text-sm">{gan.ganNumber}</span>
                  <Badge color="yellow">Awaiting GRN</Badge>
                </div>
                <p className="text-zinc-300 text-sm mt-1">{gan.po.vendor.name}</p>
                <p className="text-zinc-500 text-xs mt-0.5">
                  PO: {gan.po.poNumber} &middot; Arrived {fmtDate(gan.arrivalDate)} &middot; By {gan.createdBy.name}
                </p>
                {gan.notes && <p className="text-zinc-500 text-xs mt-1 italic">{gan.notes}</p>}
              </div>
              <button onClick={() => onCreateGRN(gan)}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white transition-colors shrink-0">
                Create GRN
              </button>
            </div>

            {/* Items summary */}
            <div className="mt-3 pt-3 border-t border-zinc-800">
              <div className="text-xs text-zinc-500 font-medium mb-1.5 uppercase tracking-wider">Items Arrived</div>
              <div className="space-y-1">
                {gan.items.map(item => {
                  const poItem = gan.po.items.find(p => p.id === item.poItemId);
                  return (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-zinc-300">{item.material.name}</span>
                      <span className="text-zinc-400">
                        {fmt(item.qtyArrived)} {item.material.unit} arrived
                        {poItem && <span className="text-zinc-600 ml-1">(PO: {fmt(poItem.quantity)})</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Completed Tab ─────────────────────────────────────────── */
function CompletedTab({ grns }: { grns: GRN[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (grns.length === 0) {
    return (
      <div className="text-center py-12">
        <Check className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-400 text-sm">No completed GRNs yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {grns.map(grn => {
        const isOpen = expanded === grn.id;
        const totalQty = grn.items.reduce((s, i) => s + i.quantity, 0);
        const totalValue = grn.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

        return (
          <div key={grn.id} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
            <button onClick={() => setExpanded(isOpen ? null : grn.id)}
              className="w-full p-4 flex items-center justify-between gap-3 text-left">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sky-400 font-mono font-medium text-sm">{grn.grnNumber}</span>
                  <span className="text-zinc-600 text-xs">{grn.purchaseOrder.poNumber}</span>
                  <Badge color="green">{grn.items.length} item{grn.items.length > 1 ? 's' : ''}</Badge>
                </div>
                <p className="text-zinc-400 text-xs mt-0.5">
                  {grn.purchaseOrder.vendor.name} &middot; {fmtDate(grn.receivedAt)} &middot; {grn.receivedBy.name}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-zinc-500 text-xs">{fmt(totalQty)} units &middot; &#8377;{fmt(totalValue)}</span>
                {isOpen ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-zinc-800 px-4 pb-4">
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-zinc-500 border-b border-zinc-800">
                        <th className="text-left pb-1">Material</th>
                        <th className="text-right pb-1">Received</th>
                        <th className="text-right pb-1">Unit Price</th>
                        <th className="text-left pb-1">Condition</th>
                        <th className="text-left pb-1">Batch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grn.items.map(item => {
                        const batch = grn.batches.find(b => b.batchCode);
                        return (
                          <tr key={item.id} className="border-b border-zinc-800/40">
                            <td className="py-1.5 text-white">
                              {item.rawMaterial.name} <span className="text-zinc-500">({item.rawMaterial.unit})</span>
                            </td>
                            <td className="py-1.5 text-right text-emerald-400">{fmt(item.quantity)}</td>
                            <td className="py-1.5 text-right text-zinc-300">&#8377;{fmt(item.unitPrice)}</td>
                            <td className="py-1.5">
                              <Badge color={item.condition === 'GOOD' ? 'green' : item.condition === 'DAMAGED' ? 'orange' : 'red'}>
                                {item.condition}
                              </Badge>
                            </td>
                            <td className="py-1.5 text-zinc-500 font-mono text-[10px]">{batch?.batchCode ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {grn.notes && (
                  <p className="text-zinc-500 text-xs mt-2 italic">Notes: {grn.notes}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── GRN Modal ─────────────────────────────────────────────── */
function GRNModal({ gan, onClose, onCreated }: { gan: PendingGAN; onClose: () => void; onCreated: () => void }) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [items, setItems] = useState(
    gan.items.map(gi => {
      const poItem = gan.po.items.find(p => p.id === gi.poItemId);
      return {
        ganItemId: gi.id,
        poItemId: gi.poItemId,
        materialId: gi.materialId,
        name: gi.material.name,
        unit: gi.material.unit,
        qtyArrived: gi.qtyArrived,
        qtyVerified: gi.qtyArrived,
        qtyRejected: 0,
        unitPrice: poItem?.unitPrice ?? 0,
        poQty: poItem?.quantity ?? 0,
        poReceived: poItem?.receivedQuantity ?? 0,
      };
    })
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const verifiedItems = items.filter(i => i.qtyVerified > 0);
    if (verifiedItems.length === 0) {
      setError('At least one item must have verified quantity > 0');
      return;
    }

    setSaving(true);
    const res = await fetch(`/api/procurement/purchase-orders/${gan.po.id}/grn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ganId: gan.id,
        notes: notes || undefined,
        items: verifiedItems.map(i => ({
          ganItemId: i.ganItemId,
          poItemId: i.poItemId,
          materialId: i.materialId,
          qtyVerified: i.qtyVerified,
          qtyRejected: i.qtyRejected,
          unitPrice: i.unitPrice,
        })),
      }),
    });
    setSaving(false);

    if (res.ok) {
      onCreated();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to create GRN');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-white font-semibold text-lg">Create GRN</h2>
            <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-zinc-500 text-sm mb-1">Against GAN: <span className="text-amber-400 font-mono">{gan.ganNumber}</span></p>
          <p className="text-zinc-500 text-xs mb-4">Vendor: {gan.po.vendor.name} &middot; PO: {gan.po.poNumber}</p>

          {/* Items */}
          <div className="space-y-4 mb-4">
            {items.map((item, i) => {
              const remaining = item.poQty - item.poReceived;
              return (
                <div key={item.materialId} className="rounded-xl p-3 border border-zinc-800" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-zinc-200 font-medium">{item.name}</span>
                    <span className="text-xs text-zinc-500">{fmt(item.qtyArrived)} {item.unit} arrived &middot; PO remaining: {fmt(remaining)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Verified Qty</label>
                      <input type="number" min={0} max={item.qtyArrived} step="any" value={item.qtyVerified}
                        onChange={e => { const n = [...items]; n[i].qtyVerified = parseFloat(e.target.value) || 0; setItems(n); }}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Rejected Qty</label>
                      <input type="number" min={0} step="any" value={item.qtyRejected}
                        onChange={e => { const n = [...items]; n[i].qtyRejected = parseFloat(e.target.value) || 0; setItems(n); }}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-red-500" />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Unit Price &#8377;</label>
                      <input type="number" min={0} step="any" value={item.unitPrice}
                        onChange={e => { const n = [...items]; n[i].unitPrice = parseFloat(e.target.value) || 0; setItems(n); }}
                        onWheel={e => (e.target as HTMLInputElement).blur()}
                        className="w-full mt-0.5 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-sm focus:outline-none focus:border-sky-500" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Verification notes (optional)..." rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm mb-4 focus:outline-none focus:border-emerald-500 resize-none" />

          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? 'Creating GRN...' : 'Create GRN + Update Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
