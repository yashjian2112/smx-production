'use client';

import { useState, useEffect } from 'react';
import { X, ClipboardList } from 'lucide-react';

interface Product { id: string; name: string; code: string; }
interface BOMItem {
  id: string; productId: string; rawMaterialId: string; voltage: string | null;
  stage: string | null; quantityRequired: number; unit: string; isCritical: boolean; notes: string | null;
  rawMaterial: { id: string; name: string; code: string; unit: string; };
}

const STAGE_LABELS: Record<string, string> = {
  POWERSTAGE_MANUFACTURING: 'PS Mfg',
  BRAINBOARD_MANUFACTURING: 'BB Mfg',
  CONTROLLER_ASSEMBLY: 'Controller Assembly',
  QC_AND_SOFTWARE: 'QC & Software',
  REWORK: 'Rework',
  FINAL_ASSEMBLY: 'Final Assembly',
};

export default function BOMAdmin() {
  const [products, setProducts]       = useState<Product[]>([]);
  const [selectedPid, setSelectedPid] = useState<string>('');
  const [items, setItems]             = useState<BOMItem[]>([]);
  const [loading, setLoading]         = useState(false);
  const [search, setSearch]           = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');

  // add-row state
  const [adding, setAdding]           = useState(false);
  const [allMats, setAllMats]         = useState<{ id: string; name: string; code: string; unit: string }[]>([]);
  const [matSearch, setMatSearch]     = useState('');
  const [newMat, setNewMat]           = useState('');
  const [newQty, setNewQty]           = useState('');
  const [newUnit, setNewUnit]         = useState('PCS');
  const [newStage, setNewStage]       = useState('');
  const [newVoltage, setNewVoltage]   = useState('');
  const [newCritical, setNewCritical] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [addErr, setAddErr]           = useState('');

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : []));
  }, []);

  useEffect(() => {
    if (!selectedPid) { setItems([]); return; }
    setLoading(true);
    fetch(`/api/inventory/bom?productId=${selectedPid}`)
      .then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : [])).finally(() => setLoading(false));
  }, [selectedPid]);

  useEffect(() => {
    if (!adding) return;
    fetch('/api/inventory/materials').then(r => r.json()).then(d => setAllMats(Array.isArray(d) ? d : (Array.isArray(d.materials) ? d.materials : [])));
  }, [adding]);

  async function toggleCritical(item: BOMItem) {
    const updated = { ...item, isCritical: !item.isCritical };
    setItems(prev => prev.map(i => i.id === item.id ? updated : i));
    await fetch('/api/inventory/bom', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, isCritical: updated.isCritical }),
    });
  }

  async function deleteItem(id: string) {
    if (!confirm('Remove this BOM item?')) return;
    await fetch(`/api/inventory/bom?id=${id}`, { method: 'DELETE' });
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function addItem() {
    if (!newMat || !newQty || !selectedPid) { setAddErr('Select material and enter qty'); return; }
    setSaving(true); setAddErr('');
    const res = await fetch('/api/inventory/bom', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: selectedPid, rawMaterialId: newMat,
        quantityRequired: parseFloat(newQty), unit: newUnit,
        stage: newStage || null, voltage: newVoltage || null,
        isCritical: newCritical,
      }),
    });
    setSaving(false);
    if (!res.ok) { const e = await res.json(); setAddErr(e.error || 'Failed'); return; }
    const created = await res.json();
    setItems(prev => [...prev, created]);
    setAdding(false); setNewMat(''); setNewQty(''); setNewUnit('PCS');
    setNewStage(''); setNewVoltage(''); setNewCritical(false); setMatSearch('');
  }

  const filtered = items.filter(i => {
    const matchSearch = i.rawMaterial.name.toLowerCase().includes(search.toLowerCase()) ||
      i.rawMaterial.code.toLowerCase().includes(search.toLowerCase());
    const matchStage =
      stageFilter === 'all' ? true :
      stageFilter === 'no_stage' ? i.stage === null :
      i.stage === stageFilter;
    return matchSearch && matchStage;
  });

  const criticalCount = items.filter(i => i.isCritical).length;
  const filteredMats = allMats.filter(m =>
    m.name.toLowerCase().includes(matSearch.toLowerCase()) || m.code.toLowerCase().includes(matSearch.toLowerCase())
  ).slice(0, 30);

  return (
    <div className="space-y-4">
      {/* Product selector */}
      <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <label className="block text-xs text-zinc-400 mb-2 font-medium">Select Product</label>
        <select value={selectedPid} onChange={e => setSelectedPid(e.target.value)}
          className="w-full rounded-xl px-3 py-2 text-sm text-white"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <option value="">— Choose a product to view its BOM —</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </select>
      </div>

      {selectedPid && (
        <>
          {/* Stats + filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-zinc-400">Total </span><span className="text-white font-semibold">{items.length}</span>
            </div>
            <div className="rounded-xl px-3 py-2 text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="text-red-400">⚠ Critical </span><span className="text-white font-semibold">{criticalCount}</span>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search component…"
              className="flex-1 min-w-[160px] rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
            <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
              className="rounded-xl px-3 py-2 text-xs text-white"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <option value="all">All Stages</option>
              <option value="no_stage">Common (All Stages)</option>
              {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button onClick={() => setAdding(true)}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-colors">
              + Add Component
            </button>
          </div>

          {/* Add component form */}
          {adding && (
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)' }}>
              <p className="text-xs font-semibold text-sky-400">Add BOM Component</p>
              <input value={matSearch} onChange={e => setMatSearch(e.target.value)} placeholder="Search material by name or code…"
                className="w-full rounded-xl px-3 py-2 text-sm text-white placeholder-zinc-600"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
              {matSearch && (
                <div className="rounded-xl overflow-hidden max-h-40 overflow-y-auto" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                  {filteredMats.map(m => (
                    <button key={m.id} onClick={() => { setNewMat(m.id); setNewUnit(m.unit); setMatSearch(m.name); }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-white/10 transition-colors ${newMat === m.id ? 'bg-sky-900/40 text-sky-300' : 'text-zinc-300'}`}>
                      <span className="font-mono text-zinc-500 mr-2">{m.code}</span>{m.name}
                    </button>
                  ))}
                  {filteredMats.length === 0 && <p className="px-3 py-2 text-zinc-600 text-xs">No materials found</p>}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Qty Required</label>
                  <input type="number" value={newQty} onChange={e => setNewQty(e.target.value)} placeholder="e.g. 4"
                    className="w-full rounded-xl px-3 py-2 text-sm text-white"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Unit</label>
                  <input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="PCS"
                    className="w-full rounded-xl px-3 py-2 text-sm text-white"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Stage (optional)</label>
                  <select value={newStage} onChange={e => setNewStage(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs text-white"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <option value="">All Stages (common)</option>
                    {Object.entries(STAGE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Voltage (optional)</label>
                  <input value={newVoltage} onChange={e => setNewVoltage(e.target.value)} placeholder="e.g. 48V"
                    className="w-full rounded-xl px-3 py-2 text-sm text-white"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={newCritical} onChange={e => setNewCritical(e.target.checked)} className="w-4 h-4 accent-red-500" />
                Mark as Critical (must be in stock before dispatch)
              </label>
              {addErr && <p className="text-red-400 text-xs">{addErr}</p>}
              <div className="flex gap-2">
                <button onClick={addItem} disabled={saving}
                  className="flex-1 rounded-xl py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 transition-colors">
                  {saving ? 'Saving…' : 'Save Component'}
                </button>
                <button onClick={() => { setAdding(false); setAddErr(''); setMatSearch(''); setNewMat(''); }}
                  className="rounded-xl px-4 py-2 text-xs text-zinc-400 hover:text-white transition-colors"
                  style={{ background: 'rgba(255,255,255,0.04)' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <p className="text-zinc-500 text-sm text-center py-8">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-zinc-600">
              <div className="flex justify-center mb-3"><ClipboardList className="w-5 h-5" /></div>
              <p className="text-sm">{items.length === 0 ? 'No BOM items for this product' : 'No items match your filter'}</p>
            </div>
          ) : (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <th className="text-left px-4 py-3 text-zinc-400 font-medium">Component</th>
                    <th className="text-left px-3 py-3 text-zinc-400 font-medium">Code</th>
                    <th className="text-center px-3 py-3 text-zinc-400 font-medium">Qty</th>
                    <th className="text-left px-3 py-3 text-zinc-400 font-medium">Stage</th>
                    <th className="text-left px-3 py-3 text-zinc-400 font-medium">Voltage</th>
                    <th className="text-center px-3 py-3 text-zinc-400 font-medium">Critical</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => (
                    <tr key={item.id}
                      style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="px-4 py-3 text-white font-medium">{item.rawMaterial.name}</td>
                      <td className="px-3 py-3 font-mono text-zinc-400">{item.rawMaterial.code}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-white font-semibold">{item.quantityRequired}</span>
                        <span className="text-zinc-500 ml-1">{item.unit}</span>
                      </td>
                      <td className="px-3 py-3">
                        {item.stage
                          ? <span className="px-2 py-0.5 rounded text-xs" style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8' }}>{STAGE_LABELS[item.stage] ?? item.stage}</span>
                          : <span className="text-zinc-600 text-xs">Common</span>}
                      </td>
                      <td className="px-3 py-3 text-zinc-400">{item.voltage || <span className="text-zinc-600">All</span>}</td>
                      <td className="px-3 py-3 text-center">
                        <button onClick={() => toggleCritical(item)}
                          className={`w-8 h-5 rounded-full transition-colors relative ${item.isCritical ? 'bg-red-500' : 'bg-zinc-700'}`}>
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${item.isCritical ? 'left-3.5' : 'left-0.5'}`} />
                        </button>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button onClick={() => deleteItem(item.id)} className="text-zinc-600 hover:text-red-400 transition-colors text-sm"><X className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-xs text-zinc-600" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                Showing {filtered.length} of {items.length} components
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
