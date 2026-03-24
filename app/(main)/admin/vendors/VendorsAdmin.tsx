'use client';
import { useState, useEffect, useCallback } from 'react';

type VendorCategory = { id: string; name: string; description?: string | null };
type Vendor = {
  id: string; code: string; name: string; contactPerson?: string | null;
  phone?: string | null; email?: string | null; address?: string | null;
  gstNumber?: string | null; categories: string[]; active: boolean;
  performance: { qualityRating?: number | null; pricingScore?: number | null; deliveredOnTime?: boolean | null }[];
};

function avgRating(v: Vendor) {
  const p = v.performance;
  if (!p.length) return null;
  const q = p.filter(x => x.qualityRating != null).map(x => x.qualityRating!);
  return q.length ? (q.reduce((a, b) => a + b, 0) / q.length).toFixed(1) : null;
}

export function VendorsAdmin() {
  const [categories, setCategories] = useState<VendorCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [catTab, setCatTab] = useState<'vendors' | 'categories'>('vendors');
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const [cv, vv] = await Promise.all([
      fetch('/api/procurement/vendor-categories').then(r => r.ok ? r.json() : []),
      fetch('/api/procurement/vendors').then(r => r.ok ? r.json() : []),
    ]);
    setCategories(cv);
    setVendors(vv);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function deleteCategory(id: string) {
    if (!confirm('Delete this category?')) return;
    await fetch(`/api/procurement/vendor-categories/${id}`, { method: 'DELETE' });
    reload();
  }

  async function addCategory() {
    if (!catName.trim()) return;
    setSaving(true);
    const r = await fetch('/api/procurement/vendor-categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: catName.trim(), description: catDesc.trim() || undefined }),
    });
    setSaving(false);
    if (r.ok) { setCatName(''); setCatDesc(''); setShowNewCat(false); reload(); }
    else { const e = await r.json(); alert(e.error); }
  }

  async function toggleActive(v: Vendor) {
    await fetch(`/api/procurement/vendors/${v.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !v.active }),
    });
    reload();
  }

  // Vendors per category stats
  function vendorsInCat(name: string) {
    return vendors.filter(v => v.active && v.categories.includes(name)).length;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Vendor Management</h2>
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1">
          {(['vendors', 'categories'] as const).map(t => (
            <button key={t} onClick={() => setCatTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${catTab === t ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
              {t === 'vendors' ? `Vendors (${vendors.length})` : `Categories (${categories.length})`}
            </button>
          ))}
        </div>
      </div>

      {catTab === 'categories' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowNewCat(true)} className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white">
              + New Category
            </button>
          </div>

          {showNewCat && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-white">New Category</p>
              <input value={catName} onChange={e => setCatName(e.target.value)} placeholder="e.g. Electrical, Mechanical, Consumable"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
              <input value={catDesc} onChange={e => setCatDesc(e.target.value)} placeholder="Description (optional)"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
              <div className="flex gap-2">
                <button onClick={addCategory} disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">Save</button>
                <button onClick={() => { setShowNewCat(false); setCatName(''); setCatDesc(''); }} className="px-4 py-2 rounded-lg text-sm bg-zinc-700 hover:bg-zinc-600 text-white">Cancel</button>
              </div>
            </div>
          )}

          {categories.length === 0 ? (
            <div className="text-center text-zinc-500 py-12">No categories yet. Add one above.</div>
          ) : (
            <div className="space-y-2">
              {categories.map(cat => {
                const count = vendorsInCat(cat.name);
                return (
                  <div key={cat.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-white">{cat.name}</div>
                      {cat.description && <div className="text-xs text-zinc-500 mt-0.5">{cat.description}</div>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${count >= 5 ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40' : count > 0 ? 'bg-amber-900/40 text-amber-300 border border-amber-700/40' : 'bg-zinc-800 text-zinc-500'}`}>
                        {count} vendor{count !== 1 ? 's' : ''} {count < 5 ? `(need ${5 - count} more)` : '✓ min met'}
                      </span>
                      <button onClick={() => deleteCategory(cat.id)} className="text-zinc-500 hover:text-red-400 text-xs">Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {catTab === 'vendors' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => setShowNewVendor(true)} className="px-3 py-1.5 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white">
              + New Vendor
            </button>
          </div>

          {showNewVendor && (
            <VendorForm categories={categories} onClose={() => setShowNewVendor(false)} onSaved={reload} />
          )}

          {editVendor && (
            <VendorForm vendor={editVendor} categories={categories} onClose={() => setEditVendor(null)} onSaved={reload} />
          )}

          {vendors.length === 0 ? (
            <div className="text-center text-zinc-500 py-12">No vendors yet.</div>
          ) : (
            <div className="space-y-2">
              {vendors.map(v => {
                const rating = avgRating(v);
                return (
                  <div key={v.id} className={`bg-zinc-900 border rounded-xl px-4 py-3 ${v.active ? 'border-zinc-800' : 'border-zinc-800/40 opacity-60'}`}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-zinc-500">{v.code}</span>
                          <span className="font-semibold text-white">{v.name}</span>
                          {!v.active && <span className="text-xs bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded">Inactive</span>}
                          {rating && <span className="text-xs text-amber-400">★ {rating}</span>}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1 space-x-3">
                          {v.contactPerson && <span>{v.contactPerson}</span>}
                          {v.phone && <span>{v.phone}</span>}
                          {v.email && <span>{v.email}</span>}
                        </div>
                        {v.categories.length > 0 && (
                          <div className="flex gap-1 flex-wrap mt-2">
                            {v.categories.map(c => (
                              <span key={c} className="text-xs bg-blue-900/30 text-blue-300 border border-blue-700/40 px-2 py-0.5 rounded">{c}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditVendor(v)} className="text-xs text-zinc-400 hover:text-white px-2 py-1 bg-zinc-800 rounded-lg">Edit</button>
                        <button onClick={() => toggleActive(v)} className={`text-xs px-2 py-1 rounded-lg ${v.active ? 'bg-zinc-800 text-zinc-400 hover:text-red-400' : 'bg-emerald-900/40 text-emerald-300'}`}>
                          {v.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VendorForm({ vendor, categories, onClose, onSaved }: {
  vendor?: Vendor; categories: VendorCategory[];
  onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(vendor?.name ?? '');
  const [contactPerson, setContactPerson] = useState(vendor?.contactPerson ?? '');
  const [phone, setPhone] = useState(vendor?.phone ?? '');
  const [email, setEmail] = useState(vendor?.email ?? '');
  const [address, setAddress] = useState(vendor?.address ?? '');
  const [gstNumber, setGstNumber] = useState(vendor?.gstNumber ?? '');
  const [selectedCats, setSelectedCats] = useState<string[]>(vendor?.categories ?? []);
  const [saving, setSaving] = useState(false);

  function toggleCat(name: string) {
    setSelectedCats(p => p.includes(name) ? p.filter(c => c !== name) : [...p, name]);
  }

  async function save() {
    if (!name.trim()) return alert('Name required');
    setSaving(true);
    const payload = { name, contactPerson, phone, email, address, gstNumber, categories: selectedCats };
    const r = vendor
      ? await fetch(`/api/procurement/vendors/${vendor.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/procurement/vendors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setSaving(false);
    if (r.ok) { onSaved(); onClose(); }
    else { const e = await r.json(); alert(e.error); }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
      <p className="text-sm font-medium text-white">{vendor ? `Edit ${vendor.name}` : 'New Vendor'}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-zinc-400 block mb-1">Vendor Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Company name"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Contact Person</label>
          <input value={contactPerson} onChange={e => setContactPerson(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Phone</label>
          <input value={phone} onChange={e => setPhone(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} type="email"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">GST Number</label>
          <input value={gstNumber} onChange={e => setGstNumber(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500" />
        </div>
        <div className="col-span-2">
          <label className="text-xs text-zinc-400 block mb-1">Address</label>
          <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none" />
        </div>
      </div>

      {categories.length > 0 && (
        <div>
          <label className="text-xs text-zinc-400 block mb-2">Categories supplied</label>
          <div className="flex gap-2 flex-wrap">
            {categories.map(c => (
              <button key={c.id} onClick={() => toggleCat(c.name)}
                className={`text-xs px-3 py-1 rounded-lg border transition-colors ${selectedCats.includes(c.name) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
                {c.name}
              </button>
            ))}
          </div>
          {categories.length === 0 && <p className="text-xs text-zinc-600">Add categories first in the Categories tab</p>}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">
          {saving ? 'Saving...' : vendor ? 'Save Changes' : 'Create Vendor'}
        </button>
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm bg-zinc-700 hover:bg-zinc-600 text-white">Cancel</button>
      </div>
    </div>
  );
}
