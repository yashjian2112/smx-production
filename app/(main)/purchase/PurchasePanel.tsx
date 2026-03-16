'use client';

import { useState, useEffect, useCallback } from 'react';

/* ─── Types ──────────────────────────────────────────────── */
type Vendor = {
  id: string; code: string; name: string;
  contactPerson?: string; phone?: string; email?: string;
  rating?: number;
  _count?: { purchaseOrders: number; bids: number };
};

type BidInvitation = {
  id: string; token: string; deadline: string; status: string;
  vendor: { name: string; code: string; email?: string };
  bid?: {
    pricePerUnit: number; totalAmount: number; leadTimeDays: number;
    validUntil: string; notes?: string; status: string; submittedAt: string;
  } | null;
};

type PurchaseRequest = {
  id: string; requestNumber: string; status: string;
  quantityRequired: number; unit: string; urgency: string; notes?: string;
  rawMaterial: { name: string; unit: string; currentStock: number };
  requestedBy: { name: string };
  bidInvitations: BidInvitation[];
  createdAt: string;
};

type PurchaseOrder = {
  id: string; poNumber: string; status: string;
  totalAmount: number; expectedDelivery?: string; createdAt: string;
  vendor: { name: string; code: string };
  purchaseRequest: { requestNumber: string; rawMaterial: { name: string } };
  createdBy: { name: string };
  items: Array<{
    id: string; quantity: number; unitPrice: number; receivedQuantity: number;
    rawMaterial: { name: string; unit: string };
  }>;
};

/* ─── Helpers ────────────────────────────────────────────── */
const URGENCY_COLOR: Record<string, string> = {
  LOW:      'text-zinc-400 bg-zinc-800',
  MEDIUM:   'text-yellow-400 bg-yellow-900/30',
  HIGH:     'text-orange-400 bg-orange-900/30',
  CRITICAL: 'text-red-400 bg-red-900/30',
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT:              'text-zinc-400 bg-zinc-800',
  OPEN:               'text-sky-400 bg-sky-900/30',
  BIDDING:            'text-purple-400 bg-purple-900/30',
  AWARDED:            'text-emerald-400 bg-emerald-900/30',
  ORDERED:            'text-blue-400 bg-blue-900/30',
  PARTIALLY_RECEIVED: 'text-orange-400 bg-orange-900/30',
  RECEIVED:           'text-emerald-400 bg-emerald-900/30',
  CANCELLED:          'text-red-400 bg-red-900/30',
  SENT:               'text-sky-400 bg-sky-900/30',
  CONFIRMED:          'text-emerald-400 bg-emerald-900/30',
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

/* ─── Tab: Purchase Requests ─────────────────────────────── */
function PRTab({ isAdmin }: { isAdmin: boolean }) {
  const [requests, setRequests]   = useState<PurchaseRequest[]>([]);
  const [vendors, setVendors]     = useState<Vendor[]>([]);
  const [materials, setMaterials] = useState<Array<{ id: string; name: string; unit: string }>>([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);

  // New PR form
  const [showNew, setShowNew]   = useState(false);
  const [form, setForm]         = useState({ rawMaterialId: '', quantityRequired: '', unit: '', urgency: 'MEDIUM', notes: '' });
  const [saving, setSaving]     = useState(false);

  // Invite vendors form
  const [inviteFor, setInviteFor]       = useState<string | null>(null);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [deadline, setDeadline]         = useState('');
  const [inviting, setInviting]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [prRes, vRes, mRes] = await Promise.all([
      fetch('/api/purchase/requests'),
      fetch('/api/purchase/vendors'),
      fetch('/api/inventory/materials'),
    ]);
    if (prRes.ok) setRequests(await prRes.json());
    if (vRes.ok)  setVendors(await vRes.json());
    if (mRes.ok)  setMaterials(await mRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createPR() {
    if (!form.rawMaterialId || !form.quantityRequired) return;
    setSaving(true);
    await fetch('/api/purchase/requests', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ...form, quantityRequired: parseFloat(form.quantityRequired) }),
    });
    setSaving(false);
    setShowNew(false);
    setForm({ rawMaterialId: '', quantityRequired: '', unit: '', urgency: 'MEDIUM', notes: '' });
    load();
  }

  async function openForBidding(id: string) {
    await fetch(`/api/purchase/requests/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'OPEN' }),
    });
    load();
  }

  async function inviteVendors(prId: string) {
    if (!selectedVendors.length || !deadline) return;
    setInviting(true);
    await fetch('/api/purchase/bid-invitations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ purchaseRequestId: prId, vendorIds: selectedVendors, deadline }),
    });
    setInviting(false);
    setInviteFor(null);
    setSelectedVendors([]);
    setDeadline('');
    load();
  }

  async function awardBid(bidInvitationId: string) {
    await fetch('/api/purchase/bid-invitations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'award', bidInvitationId }),
    });
    load();
  }

  if (loading) return <div className="text-zinc-500 py-12 text-center">Loading…</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-zinc-400 text-sm">{requests.length} requests</span>
        {isAdmin && (
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white transition-colors">
            + New Request
          </button>
        )}
      </div>

      {/* New PR form */}
      {showNew && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 mb-4 space-y-3">
          <p className="text-sm font-medium text-white">New Purchase Request</p>
          <select value={form.rawMaterialId} onChange={e => setForm(f => ({ ...f, rawMaterialId: e.target.value }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="">Select material…</option>
            {materials.map(m => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" placeholder="Quantity" value={form.quantityRequired}
              onChange={e => setForm(f => ({ ...f, quantityRequired: e.target.value }))}
              onWheel={e => (e.target as HTMLElement).blur()}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
            <input type="text" placeholder="Unit (kg, pcs…)" value={form.unit}
              onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <select value={form.urgency} onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>
          <textarea placeholder="Notes (optional)" value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-none" />
          <div className="flex gap-2">
            <button onClick={createPR} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Create'}
            </button>
            <button onClick={() => setShowNew(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white border border-zinc-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {requests.map(pr => (
          <div key={pr.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60">
            <button className="w-full text-left p-4" onClick={() => setExpanded(expanded === pr.id ? null : pr.id)}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-white font-medium text-sm">{pr.requestNumber}</span>
                  <span className="ml-3 text-zinc-400 text-sm">{pr.rawMaterial.name}</span>
                  <span className="ml-2 text-zinc-500 text-xs">· {pr.quantityRequired} {pr.unit}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${URGENCY_COLOR[pr.urgency] || ''}`}>
                    {pr.urgency}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[pr.status] || ''}`}>
                    {pr.status.replace('_', ' ')}
                  </span>
                  <svg className={`w-4 h-4 text-zinc-500 transition-transform ${expanded === pr.id ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {expanded === pr.id && (
              <div className="border-t border-zinc-800 p-4 space-y-4">
                {pr.notes && <p className="text-zinc-400 text-sm">{pr.notes}</p>}
                <div className="text-xs text-zinc-500">Requested by {pr.requestedBy.name} · {fmtDate(pr.createdAt)}</div>

                {/* Actions */}
                {isAdmin && pr.status === 'DRAFT' && (
                  <button onClick={() => openForBidding(pr.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-700 hover:bg-sky-600 text-white">
                    Open for Bidding
                  </button>
                )}

                {isAdmin && (pr.status === 'OPEN' || pr.status === 'BIDDING') && (
                  <div>
                    {inviteFor !== pr.id ? (
                      <button onClick={() => setInviteFor(pr.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-700 hover:bg-purple-600 text-white">
                        + Invite Vendors
                      </button>
                    ) : (
                      <div className="space-y-3 bg-zinc-800/50 rounded-lg p-3">
                        <p className="text-xs font-medium text-white">Select vendors to invite</p>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {vendors.map(v => (
                            <label key={v.id} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={selectedVendors.includes(v.id)}
                                onChange={e => setSelectedVendors(prev =>
                                  e.target.checked ? [...prev, v.id] : prev.filter(id => id !== v.id))}
                                className="rounded" />
                              <span className="text-sm text-white">{v.name}</span>
                              <span className="text-xs text-zinc-500">{v.code}</span>
                            </label>
                          ))}
                        </div>
                        <div>
                          <label className="text-xs text-zinc-400">Deadline</label>
                          <input type="datetime-local" value={deadline}
                            onChange={e => setDeadline(e.target.value)}
                            className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => inviteVendors(pr.id)} disabled={inviting}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-50">
                            {inviting ? 'Sending…' : 'Send Invitations'}
                          </button>
                          <button onClick={() => { setInviteFor(null); setSelectedVendors([]); }}
                            className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white border border-zinc-700">
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Bids table */}
                {pr.bidInvitations.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-zinc-400 mb-2">Vendor Bids</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-zinc-500 border-b border-zinc-800">
                            <th className="text-left pb-2 pr-4">Vendor</th>
                            <th className="text-right pb-2 pr-4">Price/Unit</th>
                            <th className="text-right pb-2 pr-4">Total</th>
                            <th className="text-right pb-2 pr-4">Lead Time</th>
                            <th className="text-center pb-2 pr-4">Status</th>
                            {isAdmin && pr.status === 'BIDDING' && <th className="pb-2"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {pr.bidInvitations.map(inv => (
                            <tr key={inv.id} className="border-b border-zinc-800/50">
                              <td className="py-2 pr-4 text-white">{inv.vendor.name}</td>
                              <td className="py-2 pr-4 text-right text-white">
                                {inv.bid ? `₹${inv.bid.pricePerUnit.toLocaleString('en-IN')}` : '—'}
                              </td>
                              <td className="py-2 pr-4 text-right text-white">
                                {inv.bid ? `₹${inv.bid.totalAmount.toLocaleString('en-IN')}` : '—'}
                              </td>
                              <td className="py-2 pr-4 text-right text-zinc-300">
                                {inv.bid ? `${inv.bid.leadTimeDays}d` : '—'}
                              </td>
                              <td className="py-2 pr-4 text-center">
                                {inv.bid ? (
                                  <span className={`px-2 py-0.5 rounded-full font-medium ${
                                    inv.bid.status === 'SELECTED' ? 'text-emerald-400 bg-emerald-900/30' :
                                    inv.bid.status === 'REJECTED' ? 'text-red-400 bg-red-900/30' :
                                    'text-yellow-400 bg-yellow-900/30'}`}>
                                    {inv.bid.status}
                                  </span>
                                ) : (
                                  <span className="text-zinc-500">Pending</span>
                                )}
                              </td>
                              {isAdmin && pr.status === 'BIDDING' && (
                                <td className="py-2">
                                  {inv.bid && inv.bid.status === 'PENDING' && (
                                    <button onClick={() => awardBid(inv.id)}
                                      className="px-2 py-1 rounded text-xs bg-emerald-700 hover:bg-emerald-600 text-white">
                                      Award
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Vendor portal links */}
                {isAdmin && pr.bidInvitations.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-zinc-400 mb-2">Vendor Portal Links</p>
                    <div className="space-y-1">
                      {pr.bidInvitations.map(inv => (
                        <div key={inv.id} className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-300">{inv.vendor.name}:</span>
                          <code className="text-sky-400 bg-zinc-800 px-2 py-0.5 rounded select-all break-all">
                            {typeof window !== 'undefined' ? `${window.location.origin}/vendor/${inv.token}` : `/vendor/${inv.token}`}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {requests.length === 0 && (
          <div className="text-zinc-500 text-sm text-center py-12">No purchase requests yet</div>
        )}
      </div>
    </div>
  );
}

/* ─── Tab: Purchase Orders ───────────────────────────────── */
function POTab({ isAdmin }: { isAdmin: boolean }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/purchase/orders')
      .then(r => r.json())
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-zinc-500 py-12 text-center">Loading…</div>;

  return (
    <div className="space-y-3">
      {orders.map(po => (
        <div key={po.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60">
          <button className="w-full text-left p-4" onClick={() => setExpanded(expanded === po.id ? null : po.id)}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-white font-medium text-sm">{po.poNumber}</span>
                <span className="ml-3 text-zinc-400 text-sm">{po.vendor.name}</span>
                <span className="ml-2 text-zinc-500 text-xs">· {po.purchaseRequest.rawMaterial.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">₹{po.totalAmount.toLocaleString('en-IN')}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[po.status] || ''}`}>
                  {po.status}
                </span>
              </div>
            </div>
          </button>

          {expanded === po.id && (
            <div className="border-t border-zinc-800 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-zinc-500">PR Reference</p>
                  <p className="text-white">{po.purchaseRequest.requestNumber}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Created by</p>
                  <p className="text-white">{po.createdBy.name}</p>
                </div>
                {po.expectedDelivery && (
                  <div>
                    <p className="text-zinc-500">Expected Delivery</p>
                    <p className="text-white">{fmtDate(po.expectedDelivery)}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-zinc-400 mb-2">Items</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-800">
                      <th className="text-left pb-1 pr-4">Material</th>
                      <th className="text-right pb-1 pr-4">Qty</th>
                      <th className="text-right pb-1 pr-4">Price/Unit</th>
                      <th className="text-right pb-1">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map(item => (
                      <tr key={item.id} className="border-b border-zinc-800/50">
                        <td className="py-1.5 pr-4 text-white">{item.rawMaterial.name}</td>
                        <td className="py-1.5 pr-4 text-right text-zinc-300">{item.quantity} {item.rawMaterial.unit}</td>
                        <td className="py-1.5 pr-4 text-right text-zinc-300">₹{item.unitPrice.toLocaleString('en-IN')}</td>
                        <td className={`py-1.5 text-right ${item.receivedQuantity >= item.quantity ? 'text-emerald-400' : 'text-yellow-400'}`}>
                          {item.receivedQuantity}/{item.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}
      {orders.length === 0 && (
        <div className="text-zinc-500 text-sm text-center py-12">No purchase orders yet</div>
      )}
    </div>
  );
}

/* ─── Tab: Vendors ───────────────────────────────────────── */
function VendorsTab({ isAdmin }: { isAdmin: boolean }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/purchase/vendors');
    if (res.ok) setVendors(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createVendor() {
    setSaving(true);
    await fetch('/api/purchase/vendors', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    });
    setSaving(false);
    setShowNew(false);
    setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', gstNumber: '' });
    load();
  }

  if (loading) return <div className="text-zinc-500 py-12 text-center">Loading…</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-zinc-400 text-sm">{vendors.length} vendors</span>
        {isAdmin && (
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white">
            + Add Vendor
          </button>
        )}
      </div>

      {showNew && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 mb-4 space-y-3">
          <p className="text-sm font-medium text-white">New Vendor</p>
          <input placeholder="Company Name *" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Contact Person" value={form.contactPerson}
              onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
            <input placeholder="Phone" value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
            <input placeholder="GST Number" value={form.gstNumber}
              onChange={e => setForm(f => ({ ...f, gstNumber: e.target.value }))}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
          <textarea placeholder="Address" value={form.address}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white resize-none" />
          <div className="flex gap-2">
            <button onClick={createVendor} disabled={saving || !form.name}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Create'}
            </button>
            <button onClick={() => setShowNew(false)}
              className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white border border-zinc-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {vendors.map(v => (
          <div key={v.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white font-medium text-sm">{v.name}</p>
                <p className="text-zinc-500 text-xs mt-0.5">{v.code}</p>
              </div>
              {v.rating && (
                <span className="text-yellow-400 text-xs">★ {v.rating.toFixed(1)}</span>
              )}
            </div>
            {v.contactPerson && <p className="text-zinc-400 text-xs mt-2">{v.contactPerson}</p>}
            <div className="flex gap-4 mt-2 text-xs text-zinc-500">
              {v.phone && <span>📞 {v.phone}</span>}
              {v.email && <span>✉ {v.email}</span>}
            </div>
            <div className="flex gap-4 mt-2 text-xs text-zinc-500">
              <span>{v._count?.purchaseOrders ?? 0} orders</span>
              <span>{v._count?.bids ?? 0} bids</span>
            </div>
          </div>
        ))}
      </div>

      {vendors.length === 0 && (
        <div className="text-zinc-500 text-sm text-center py-12">No vendors yet</div>
      )}
    </div>
  );
}

/* ─── Main Panel ─────────────────────────────────────────── */
const TABS = ['Requests', 'Orders', 'Vendors'] as const;
type Tab = typeof TABS[number];

export default function PurchasePanel({ sessionRole }: { sessionRole: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('Requests');
  const isAdmin = ['ADMIN', 'PURCHASE_MANAGER'].includes(sessionRole);

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'rgba(255,255,255,0.04)' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab
                ? 'bg-sky-600 text-white shadow-lg'
                : 'text-zinc-400 hover:text-white'}`}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Requests' && <PRTab isAdmin={isAdmin} />}
      {activeTab === 'Orders'   && <POTab isAdmin={isAdmin} />}
      {activeTab === 'Vendors'  && <VendorsTab isAdmin={isAdmin} />}
    </div>
  );
}
