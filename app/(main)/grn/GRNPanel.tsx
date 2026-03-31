'use client';

import { useState, useEffect, useCallback } from 'react';
import { Package, Check, X, ChevronDown, ChevronUp, ScanLine, Printer, CheckCircle } from 'lucide-react';
import { BarcodeScanner } from '@/components/BarcodeScanner';

/* ─── Types ─────────────────────────────────────────────────── */
interface GANItem {
  id: string;
  poItemId: string;
  materialId: string;
  qtyArrived: number;
  material: { id: string; name: string; unit: string; barcode: string | null };
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
                Verify &amp; Receive
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
                <span className="text-zinc-500 text-xs">{fmt(totalQty)} units</span>
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

/* ─── GRN Modal — 3-step flow ───────────────────────────────── */
type GRNStep = 'confirm' | 'print' | 'scan';

interface CreatedGRNInfo {
  id: string;
  grnNumber: string;
  serialCount: number;
}

interface GRNItemState {
  ganItemId: string;
  poItemId: string;
  materialId: string;
  name: string;
  unit: string;
  expectedBarcode: string | null;
  qtyArrived: number;
  qtyVerified: number;
  qtyRejected: number;
  unitPrice: number;
  poQty: number;
  poReceived: number;
  scanned: boolean;
}

function GRNModal({ gan, onClose, onCreated }: { gan: PendingGAN; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<GRNStep>('confirm');
  const [createdGRN, setCreatedGRN] = useState<CreatedGRNInfo | null>(null);

  // Step 1 state
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [items, setItems] = useState<GRNItemState[]>(
    gan.items.map(gi => {
      const poItem = gan.po.items.find(p => p.id === gi.poItemId);
      return {
        ganItemId: gi.id,
        poItemId: gi.poItemId,
        materialId: gi.materialId,
        name: gi.material.name,
        unit: gi.material.unit,
        expectedBarcode: gi.material.barcode,
        qtyArrived: gi.qtyArrived,
        qtyVerified: gi.qtyArrived,
        qtyRejected: 0,
        unitPrice: poItem?.unitPrice ?? 0,
        poQty: poItem?.quantity ?? 0,
        poReceived: poItem?.receivedQuantity ?? 0,
        scanned: true, // qty always editable — verification happens in Step 3 via serial scan
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
      const data = await res.json();
      setCreatedGRN({
        id: data.id,
        grnNumber: data.grnNumber,
        serialCount: data.materialSerialsGenerated ?? 0,
      });
      setStep('print');
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to create GRN');
    }
  }

  const allMatch = items.every(i => i.qtyVerified === i.qtyArrived);

  return (
    <>
      <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col overflow-hidden">

        {/* Step 1 — Confirm Qty */}
        {step === 'confirm' && (
          <form onSubmit={submit} className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-zinc-800 shrink-0">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-white font-semibold text-xl">Verify &amp; Create GRN</h2>
                <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-zinc-500 text-sm">
                GAN: <span className="text-amber-400 font-mono">{gan.ganNumber}</span>
                <span className="mx-2 text-zinc-700">·</span>
                {gan.po.vendor.name}
                <span className="mx-2 text-zinc-700">·</span>
                PO: {gan.po.poNumber}
              </p>

              {/* Step indicator */}
              <div className="flex items-center gap-2 mt-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">1</div>
                  <span className="text-xs text-white font-medium">Confirm Qty</span>
                </div>
                <div className="flex-1 h-px bg-zinc-700" />
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-bold">2</div>
                  <span className="text-xs text-zinc-500">Print Labels</span>
                </div>
                <div className="flex-1 h-px bg-zinc-700" />
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-bold">3</div>
                  <span className="text-xs text-zinc-500">Scan &amp; Verify</span>
                </div>
              </div>
            </div>

            {/* Items — scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="max-w-2xl mx-auto space-y-3">
                {items.map((item, i) => {
                  const matches = item.qtyVerified === item.qtyArrived;
                  const totalEntered = item.qtyVerified + item.qtyRejected;
                  const overCount = totalEntered > item.qtyArrived;

                  return (
                    <div key={item.materialId}
                      className={`rounded-xl border transition-colors ${matches ? 'border-emerald-800/60' : 'border-zinc-800'}`}
                      style={{ background: matches ? 'rgba(16,185,129,0.05)' : 'rgba(255,255,255,0.03)' }}>

                      {/* Item header */}
                      <div className="flex items-center justify-between px-4 pt-4 pb-2 gap-4">
                        <div className="min-w-0">
                          <p className="text-white font-medium text-sm">{item.name}</p>
                          <p className="text-zinc-500 text-xs mt-0.5">PO qty: {fmt(item.poQty)} {item.unit}</p>
                        </div>
                        {/* qty display: verified / arrived */}
                        <div className="shrink-0 text-right">
                          <div className={`font-mono font-bold text-2xl leading-none ${matches ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {fmt(item.qtyVerified)}
                            <span className="text-zinc-600 font-normal text-lg">/{fmt(item.qtyArrived)}</span>
                          </div>
                          <p className="text-zinc-500 text-[10px] mt-0.5 uppercase tracking-wider">{item.unit}</p>
                        </div>
                      </div>

                      {/* Qty inputs */}
                      <div className="grid grid-cols-2 gap-3 px-4 pb-4">
                        <div>
                          <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Received Qty</label>
                          <input type="number" min={0} max={item.qtyArrived} step="any" value={item.qtyVerified}
                            onChange={e => { const n = [...items]; n[i].qtyVerified = parseFloat(e.target.value) || 0; setItems(n); }}
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            className={`w-full mt-1 bg-zinc-800 border rounded-lg px-3 py-2 text-white text-sm focus:outline-none transition-colors ${
                              matches ? 'border-emerald-700 focus:border-emerald-500' : 'border-zinc-700 focus:border-amber-500'
                            }`} />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Rejected Qty</label>
                          <input type="number" min={0} step="any" value={item.qtyRejected}
                            onChange={e => { const n = [...items]; n[i].qtyRejected = parseFloat(e.target.value) || 0; setItems(n); }}
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-red-500" />
                        </div>
                      </div>

                      {overCount && (
                        <div className="px-4 pb-3">
                          <p className="text-red-400 text-xs">Received + Rejected ({fmt(totalEntered)}) exceeds arrived qty ({fmt(item.qtyArrived)})</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (optional)..." rows={2}
                  className="w-full bg-zinc-800/60 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-zinc-500 resize-none" />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-zinc-800 shrink-0">
              <div className="max-w-2xl mx-auto">
                {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
                {!allMatch && (
                  <p className="text-amber-400 text-xs mb-3 text-center">
                    Received qty must match arrived qty for all items to proceed
                  </p>
                )}
                <div className="flex gap-3">
                  <button type="button" onClick={onClose}
                    className="flex-1 py-3 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">Cancel</button>
                  <button type="submit" disabled={saving || !allMatch}
                    className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                    {saving ? 'Creating GRN...' : 'Confirm &amp; Generate Barcodes'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Step 2 — Print Labels */}
        {step === 'print' && createdGRN && (
          <div className="flex flex-col h-full">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-800 shrink-0">
              <h2 className="text-white font-semibold text-xl mb-3">GRN Created</h2>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white" />
                  </div>
                  <span className="text-xs text-zinc-400">Confirm Qty</span>
                </div>
                <div className="flex-1 h-px bg-emerald-800" />
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">2</div>
                  <span className="text-xs text-white font-medium">Print Labels</span>
                </div>
                <div className="flex-1 h-px bg-zinc-700" />
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-400 text-xs font-bold">3</div>
                  <span className="text-xs text-zinc-500">Scan &amp; Verify</span>
                </div>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-lg mx-auto w-full">
              <div className="rounded-xl border border-emerald-800/50 p-5 mb-6 w-full" style={{ background: 'rgba(16,185,129,0.06)' }}>
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-emerald-300 font-semibold">GRN Created Successfully</p>
                    <p className="text-emerald-500 font-mono text-sm mt-0.5">{createdGRN.grnNumber}</p>
                  </div>
                </div>
                {createdGRN.serialCount > 0 ? (
                  <p className="text-zinc-400 text-sm mt-2">
                    <span className="text-white font-semibold">{createdGRN.serialCount}</span> barcode labels generated and ready to print.
                  </p>
                ) : (
                  <p className="text-zinc-400 text-sm mt-2">No barcodes generated (no serialized materials).</p>
                )}
              </div>

              {createdGRN.serialCount > 0 && (
                <>
                  <p className="text-zinc-500 text-sm mb-5 text-center">Print the barcode labels and affix them to the received items, then scan each one to confirm.</p>
                  <button onClick={() => window.open(`/print/grn-serials/${createdGRN.id}`, '_blank')}
                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-sky-700 hover:bg-sky-600 text-white text-sm font-medium transition-colors mb-3">
                    <Printer className="w-4 h-4" />
                    Print Barcode Labels ({createdGRN.serialCount} labels)
                  </button>
                  <button onClick={() => setStep('scan')}
                    className="w-full py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium transition-colors mb-3">
                    Continue to Scan &amp; Verify
                  </button>
                </>
              )}
              <button onClick={onCreated}
                className="w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors">
                {createdGRN.serialCount > 0 ? 'Skip Scanning — Done' : 'Done'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Scan & Verify */}
        {step === 'scan' && createdGRN && (
          <SerialScanStep
            grnId={createdGRN.id}
            grnNumber={createdGRN.grnNumber}
            onDone={onCreated}
            onPrintAgain={() => window.open(`/print/grn-serials/${createdGRN.id}`, '_blank')}
          />
        )}
      </div>

    </>
  );
}

/* ─── Step 3: Serial Scan & Verify ─────────────────────────── */
interface MaterialSerial {
  id: string;
  barcode: string;
  quantity: number;
  stageType: string;
  status: string;
  material: { id: string; name: string; code: string; unit: string };
}

function SerialScanStep({
  grnId,
  grnNumber,
  onDone,
  onPrintAgain,
}: {
  grnId: string;
  grnNumber: string;
  onDone: () => void;
  onPrintAgain: () => void;
}) {
  const [serials, setSerials] = useState<MaterialSerial[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/procurement/material-serials?grnId=${grnId}`)
      .then(r => r.json())
      .then(data => { setSerials(Array.isArray(data) ? data : []); setLoading(false); });
  }, [grnId]);

  const confirmed = serials.filter(s => s.status === 'CONFIRMED').length;
  const total = serials.length;
  const allConfirmed = confirmed === total && total > 0;

  // Group by material
  const byMaterial = serials.reduce<Record<string, { name: string; code: string; unit: string; items: MaterialSerial[] }>>(
    (acc, s) => {
      const key = s.material.id;
      if (!acc[key]) acc[key] = { name: s.material.name, code: s.material.code, unit: s.material.unit, items: [] };
      acc[key].items.push(s);
      return acc;
    },
    {}
  );

  async function handleScan(barcode: string) {
    setScanError('');
    const res = await fetch('/api/procurement/material-serials/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ barcode }),
    });
    const data = await res.json();
    if (!res.ok) {
      setScanError(data.error || 'Scan failed');
      return;
    }
    // Update local state
    setSerials(prev => prev.map(s => s.id === data.id ? { ...s, status: 'CONFIRMED' } : s));
    setLastScanned(data.barcode);
    setScanning(false);
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-white font-semibold text-xl mb-3">Scan &amp; Verify Barcodes</h2>
          {/* Step indicator */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-xs text-zinc-400">Confirm Qty</span>
            </div>
            <div className="flex-1 h-px bg-emerald-800" />
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-xs text-zinc-400">Print Labels</span>
            </div>
            <div className="flex-1 h-px bg-emerald-800" />
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold">3</div>
              <span className="text-xs text-white font-medium">Scan &amp; Verify</span>
            </div>
          </div>
          <p className="text-zinc-500 text-xs mt-3">GRN: <span className="text-zinc-300 font-mono">{grnNumber}</span></p>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-2xl mx-auto">
            {loading ? (
              <p className="text-zinc-400 text-sm py-6 text-center">Loading barcodes...</p>
            ) : (
              <>
                {/* Progress bar */}
                <div className="mb-4 p-3 rounded-xl border border-zinc-800" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-400 uppercase tracking-wider font-medium">Scan Progress</span>
                    <Badge color={allConfirmed ? 'green' : 'yellow'}>{confirmed}/{total} confirmed</Badge>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full transition-all"
                      style={{ width: total > 0 ? `${(confirmed / total) * 100}%` : '0%' }} />
                  </div>
                  {lastScanned && (
                    <p className="text-emerald-400 text-xs mt-2 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Last scanned: <span className="font-mono">{lastScanned}</span>
                    </p>
                  )}
                </div>

                {/* Scan button */}
                {!allConfirmed && (
                  <button
                    onClick={() => { setScanError(''); setScanning(true); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-sky-700 hover:bg-sky-600 text-white text-sm font-medium transition-colors mb-4">
                    <ScanLine className="w-4 h-4" />
                    Scan Next Barcode
                  </button>
                )}

                {scanError && (
                  <div className="mb-3 p-3 rounded-xl bg-red-900/30 border border-red-800">
                    <p className="text-red-400 text-sm">{scanError}</p>
                    <button onClick={() => setScanError('')} className="text-red-500 text-xs mt-1 underline">Dismiss</button>
                  </div>
                )}

                {/* Serials list grouped by material */}
                <div className="space-y-3">
                  {Object.values(byMaterial).map(group => (
                    <div key={group.code}>
                      <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider mb-1.5">
                        {group.name} ({group.code})
                      </div>
                      <div className="space-y-1">
                        {group.items.map(s => (
                          <div key={s.id}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                              s.status === 'CONFIRMED'
                                ? 'bg-emerald-900/20 border border-emerald-800/40'
                                : 'bg-zinc-800/50 border border-zinc-700/50'
                            }`}>
                            <span className="font-mono text-zinc-300">{s.barcode}</span>
                            <div className="flex items-center gap-2">
                              {s.quantity > 1 && <span className="text-zinc-500">×{s.quantity}</span>}
                              {s.status === 'CONFIRMED' ? (
                                <span className="flex items-center gap-1 text-emerald-400">
                                  <Check className="w-3 h-3" /> Confirmed
                                </span>
                              ) : (
                                <span className="text-zinc-500">Pending</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        {!loading && (
          <div className="px-6 py-4 border-t border-zinc-800 shrink-0">
            <div className="max-w-2xl mx-auto">
              <div className="flex gap-2 mb-3">
                <button onClick={onPrintAgain}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors">
                  <Printer className="w-3.5 h-3.5" />
                  Print Again
                </button>
              </div>
              {allConfirmed ? (
                <button onClick={onDone}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  All Verified — Done
                </button>
              ) : (
                <button onClick={onDone}
                  className="w-full py-2.5 rounded-xl bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 transition-colors">
                  Skip Remaining — Done ({confirmed}/{total} scanned)
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Serial barcode scanner overlay */}
      {scanning && (
        <div className="fixed inset-0 z-[60]">
          <BarcodeScanner
            title="Scan Serial Barcode"
            hint="Scan the printed barcode label to confirm receipt"
            onScan={handleScan}
            onClose={() => { setScanning(false); setScanError(''); }}
          />
        </div>
      )}
    </>
  );
}
