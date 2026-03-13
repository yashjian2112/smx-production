'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type ClientRow = {
  id: string;
  code: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  customerType: string | null;
  globalOrIndian: string | null;
  billingAddress: string | null;
  shippingAddress: string | null;
  gstNumber: string | null;
  active: boolean;
  _count: { orders: number };
};

const CUSTOMER_TYPES = ['OEM', 'Retail', 'Dealer', 'Distributor', 'Government', 'Other'];

const emptyForm = {
  code: '',
  customerName: '',
  email: '',
  phone: '',
  customerType: '',
  globalOrIndian: '' as '' | 'Global' | 'Indian',
  billingAddress: '',
  shippingAddress: '',
  gstNumber: '',
};

type Modal = { type: 'add' } | { type: 'edit'; client: ClientRow } | null;

export function ClientsAdmin({ clients: initial }: { clients: ClientRow[] }) {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>(initial);
  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sameAddress, setSameAddress] = useState(false);

  function openAdd() {
    setForm({ ...emptyForm });
    setSameAddress(false);
    setError('');
    setModal({ type: 'add' });
  }

  function openEdit(c: ClientRow) {
    setForm({
      code: c.code,
      customerName: c.customerName,
      email: c.email ?? '',
      phone: c.phone ?? '',
      customerType: c.customerType ?? '',
      globalOrIndian: (c.globalOrIndian as '' | 'Global' | 'Indian') ?? '',
      billingAddress: c.billingAddress ?? '',
      shippingAddress: c.shippingAddress ?? '',
      gstNumber: c.gstNumber ?? '',
    });
    setSameAddress(false);
    setError('');
    setModal({ type: 'edit', client: c });
  }

  function closeModal() { setModal(null); setError(''); setSaving(false); }

  function field(key: keyof typeof form, value: string) {
    setForm((f) => {
      const updated = { ...f, [key]: value };
      // If "same address" checked, keep shipping in sync
      if (key === 'billingAddress' && sameAddress) {
        updated.shippingAddress = value;
      }
      return updated;
    });
  }

  function toggleSameAddress(checked: boolean) {
    setSameAddress(checked);
    if (checked) setForm((f) => ({ ...f, shippingAddress: f.billingAddress }));
  }

  async function handleAdd() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          phone: form.phone || undefined,
          customerType: form.customerType || undefined,
          globalOrIndian: form.globalOrIndian || undefined,
          billingAddress: form.billingAddress || undefined,
          shippingAddress: form.shippingAddress || undefined,
          gstNumber: form.gstNumber || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create client'); setSaving(false); return; }
      setClients((prev) => [...prev, { ...data, _count: { orders: 0 } }].sort((a, b) => a.customerName.localeCompare(b.customerName)));
      closeModal();
    } catch { setError('Network error'); setSaving(false); }
  }

  async function handleEdit() {
    if (modal?.type !== 'edit') return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/clients/${modal.client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName:   form.customerName,
          email:          form.email || '',
          phone:          form.phone || '',
          customerType:   form.customerType || '',
          globalOrIndian: form.globalOrIndian || '',
          billingAddress: form.billingAddress || '',
          shippingAddress:form.shippingAddress || '',
          gstNumber:      form.gstNumber || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to update client'); setSaving(false); return; }
      setClients((prev) => prev.map((c) => c.id === data.id ? { ...c, ...data } : c));
      closeModal();
    } catch { setError('Network error'); setSaving(false); }
  }

  async function toggleActive(c: ClientRow) {
    try {
      const res = await fetch(`/api/clients/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !c.active }),
      });
      if (res.ok) setClients((prev) => prev.map((x) => x.id === c.id ? { ...x, active: !x.active } : x));
    } catch { /* ignore */ }
  }

  const filtered = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.customerName.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
    );
  });

  const labelCls = 'block text-xs text-slate-400 mb-1';
  const inputCls = 'w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500 mb-3';

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Clients</h2>
          <p className="text-xs text-slate-500 mt-0.5">{clients.length} client{clients.length !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-sm font-medium text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Client
        </button>
      </div>

      {/* Search */}
      <input
        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-sky-500"
        placeholder="Search by name, code, email or phone…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Client list */}
      {filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-zinc-500 text-sm">{search ? 'No clients match your search.' : 'No clients yet. Add your first client.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border transition-opacity ${
                c.active ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-950 border-zinc-800/50 opacity-60'
              }`}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-sky-900/60 border border-sky-700/30 flex items-center justify-center text-sm font-semibold text-sky-300 shrink-0">
                    {c.customerName.slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white text-sm">{c.customerName}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded border font-mono"
                        style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#a1a1aa' }}
                      >
                        {c.code}
                      </span>
                      {c.globalOrIndian && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded border font-medium"
                          style={
                            c.globalOrIndian === 'Global'
                              ? { background: 'rgba(56,189,248,0.1)', borderColor: 'rgba(56,189,248,0.3)', color: '#38bdf8' }
                              : { background: 'rgba(251,191,36,0.1)', borderColor: 'rgba(251,191,36,0.3)', color: '#fbbf24' }
                          }
                        >
                          {c.globalOrIndian}
                        </span>
                      )}
                      {c.customerType && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-violet-500/10 text-violet-400 border-violet-500/20">
                          {c.customerType}
                        </span>
                      )}
                      {!c.active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-500/20">
                          Inactive
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.email && <p className="text-xs text-slate-500 truncate">{c.email}</p>}
                      {c.phone && <p className="text-xs text-slate-500">{c.phone}</p>}
                    </div>

                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                      {c.gstNumber && <p className="text-xs text-slate-600 font-mono">GST: {c.gstNumber}</p>}
                      <p className="text-xs text-slate-600">{c._count.orders} order{c._count.orders !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>

                {/* Action row */}
                <div className="flex items-center gap-2 mt-3 pl-12">
                  <button
                    onClick={() => openEdit(c)}
                    className="flex-1 py-1.5 rounded-lg border border-slate-600 hover:border-slate-400 text-xs text-slate-300 hover:text-white transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleActive(c)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs transition-colors ${
                      c.active
                        ? 'border-red-700/50 text-red-400 hover:border-red-500 hover:text-red-300'
                        : 'border-green-700/50 text-green-400 hover:border-green-500 hover:text-green-300'
                    }`}
                  >
                    {c.active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {modal?.type === 'add' && (
        <Drawer title="Add New Client" onClose={closeModal}>
          <label className={labelCls}>Client Code <span className="text-slate-600 font-normal text-[10px]">(unique, e.g. CLI001)</span></label>
          <input className={inputCls} placeholder="CLI001" value={form.code} onChange={(e) => field('code', e.target.value.toUpperCase())} />

          <label className={labelCls}>Customer Name <span className="text-red-500">*</span></label>
          <input className={inputCls} placeholder="e.g. Acme Motors Pvt Ltd" value={form.customerName} onChange={(e) => field('customerName', e.target.value)} />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" className={inputCls} placeholder="contact@acme.com" value={form.email} onChange={(e) => field('email', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} placeholder="+91 98765 43210" value={form.phone} onChange={(e) => field('phone', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Customer Type</label>
              <select className={inputCls} value={form.customerType} onChange={(e) => field('customerType', e.target.value)}>
                <option value="">Not specified</option>
                {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Global / Indian</label>
              <select className={inputCls} value={form.globalOrIndian} onChange={(e) => field('globalOrIndian', e.target.value as '' | 'Global' | 'Indian')}>
                <option value="">Not specified</option>
                <option value="Indian">Indian</option>
                <option value="Global">Global</option>
              </select>
            </div>
          </div>

          <label className={labelCls}>GST Number</label>
          <input className={inputCls} placeholder="22AAAAA0000A1Z5" value={form.gstNumber} onChange={(e) => field('gstNumber', e.target.value.toUpperCase())} />

          <label className={labelCls}>Billing Address</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            placeholder="Full billing address…"
            value={form.billingAddress}
            onChange={(e) => field('billingAddress', e.target.value)}
          />

          <div className="flex items-center gap-2 -mt-1 mb-2">
            <input
              id="same-addr"
              type="checkbox"
              checked={sameAddress}
              onChange={(e) => toggleSameAddress(e.target.checked)}
              className="accent-sky-500"
            />
            <label htmlFor="same-addr" className="text-xs text-slate-400 cursor-pointer">Shipping same as billing</label>
          </div>

          {!sameAddress && (
            <>
              <label className={labelCls}>Shipping Address</label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={2}
                placeholder="Full shipping address…"
                value={form.shippingAddress}
                onChange={(e) => field('shippingAddress', e.target.value)}
              />
            </>
          )}

          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
          <div className="flex gap-2 mt-1">
            <button onClick={closeModal} className="flex-1 py-2 rounded-lg border border-slate-600 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={saving || !form.code || !form.customerName}
              className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-sm font-medium text-white transition-colors"
            >
              {saving ? 'Creating…' : 'Create Client'}
            </button>
          </div>
        </Drawer>
      )}

      {/* Edit Modal */}
      {modal?.type === 'edit' && (
        <Drawer title={`Edit — ${modal.client.customerName}`} onClose={closeModal}>
          <label className={labelCls}>Customer Name <span className="text-red-500">*</span></label>
          <input className={inputCls} value={form.customerName} onChange={(e) => field('customerName', e.target.value)} />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Email</label>
              <input type="email" className={inputCls} value={form.email} onChange={(e) => field('email', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input className={inputCls} value={form.phone} onChange={(e) => field('phone', e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Customer Type</label>
              <select className={inputCls} value={form.customerType} onChange={(e) => field('customerType', e.target.value)}>
                <option value="">Not specified</option>
                {CUSTOMER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Global / Indian</label>
              <select className={inputCls} value={form.globalOrIndian} onChange={(e) => field('globalOrIndian', e.target.value as '' | 'Global' | 'Indian')}>
                <option value="">Not specified</option>
                <option value="Indian">Indian</option>
                <option value="Global">Global</option>
              </select>
            </div>
          </div>

          <label className={labelCls}>GST Number</label>
          <input className={inputCls} value={form.gstNumber} onChange={(e) => field('gstNumber', e.target.value.toUpperCase())} />

          <label className={labelCls}>Billing Address</label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            value={form.billingAddress}
            onChange={(e) => field('billingAddress', e.target.value)}
          />

          <div className="flex items-center gap-2 -mt-1 mb-2">
            <input
              id="same-addr-edit"
              type="checkbox"
              checked={sameAddress}
              onChange={(e) => toggleSameAddress(e.target.checked)}
              className="accent-sky-500"
            />
            <label htmlFor="same-addr-edit" className="text-xs text-slate-400 cursor-pointer">Shipping same as billing</label>
          </div>

          {!sameAddress && (
            <>
              <label className={labelCls}>Shipping Address</label>
              <textarea
                className={`${inputCls} resize-none`}
                rows={2}
                value={form.shippingAddress}
                onChange={(e) => field('shippingAddress', e.target.value)}
              />
            </>
          )}

          {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
          <div className="flex gap-2 mt-1">
            <button onClick={closeModal} className="flex-1 py-2 rounded-lg border border-slate-600 text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={handleEdit}
              disabled={saving || !form.customerName}
              className="flex-1 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-sm font-medium text-white transition-colors"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </Drawer>
      )}
    </div>
  );
}

function Drawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
