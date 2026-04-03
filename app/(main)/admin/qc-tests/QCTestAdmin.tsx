'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, GripVertical, Camera, Bot, Save, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';

type Param = {
  id?: string;
  name: string;
  label: string;
  unit: string;
  minValue: number | null;
  maxValue: number | null;
  matchTolerance: number | null;
  matchParamId: string | null;
  isWriteParam: boolean;
  hardBlock: boolean;
  sortOrder: number;
};

type TestItem = {
  id: string;
  productId: string;
  name: string;
  sortOrder: number;
  requirePhoto: boolean;
  aiExtract: boolean;
  active: boolean;
  params: Param[];
};

type Product = { id: string; name: string; code: string };

export default function QCTestAdmin({
  products,
  initialItems,
}: {
  products: Product[];
  initialItems: TestItem[];
}) {
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id ?? '');
  const [items, setItems] = useState<TestItem[]>(initialItems);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const filtered = items
    .filter(i => i.productId === selectedProduct && i.active)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // ── Add new test item ──
  const [newName, setNewName] = useState('');
  const [newRequirePhoto, setNewRequirePhoto] = useState(true);
  const [newAiExtract, setNewAiExtract] = useState(true);
  const [newParams, setNewParams] = useState<Param[]>([]);

  const resetAddForm = () => {
    setNewName('');
    setNewRequirePhoto(true);
    setNewAiExtract(true);
    setNewParams([]);
    setShowAddForm(false);
  };

  const addParam = (list: Param[], setter: (p: Param[]) => void) => {
    setter([
      ...list,
      {
        name: '',
        label: '',
        unit: '',
        minValue: null,
        maxValue: null,
        matchTolerance: null,
        matchParamId: null,
        isWriteParam: false,
        hardBlock: false,
        sortOrder: list.length,
      },
    ]);
  };

  const updateParam = (list: Param[], setter: (p: Param[]) => void, idx: number, field: string, value: unknown) => {
    const updated = [...list];
    (updated[idx] as Record<string, unknown>)[field] = value;
    setter(updated);
  };

  const removeParam = (list: Param[], setter: (p: Param[]) => void, idx: number) => {
    setter(list.filter((_, i) => i !== idx));
  };

  const handleCreate = async () => {
    if (!newName.trim() || !selectedProduct) return;
    setSaving('new');
    const res = await fetch('/api/admin/qc-tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: selectedProduct,
        name: newName.trim(),
        sortOrder: filtered.length,
        requirePhoto: newRequirePhoto,
        aiExtract: newAiExtract,
        params: newParams.filter(p => p.name.trim()),
      }),
    });
    if (res.ok) {
      const created: TestItem = await res.json();
      setItems(prev => [...prev, created]);
      resetAddForm();
    }
    setSaving(null);
  };

  const handleUpdate = async (item: TestItem) => {
    setSaving(item.id);
    const res = await fetch(`/api/admin/qc-tests/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.name,
        sortOrder: item.sortOrder,
        requirePhoto: item.requirePhoto,
        aiExtract: item.aiExtract,
        params: item.params.filter(p => p.name.trim()),
      }),
    });
    if (res.ok) {
      const updated: TestItem = await res.json();
      setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)));
    }
    setSaving(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this QC test item?')) return;
    setSaving(id);
    const res = await fetch(`/api/admin/qc-tests/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setItems(prev => prev.map(i => (i.id === id ? { ...i, active: false } : i)));
    }
    setSaving(null);
  };

  const updateItemField = (id: string, field: string, value: unknown) => {
    setItems(prev =>
      prev.map(i => (i.id === id ? { ...i, [field]: value } : i))
    );
  };

  const updateItemParam = (itemId: string, paramIdx: number, field: string, value: unknown) => {
    setItems(prev =>
      prev.map(i => {
        if (i.id !== itemId) return i;
        const params = [...i.params];
        (params[paramIdx] as Record<string, unknown>)[field] = value;
        return { ...i, params };
      })
    );
  };

  const addItemParam = (itemId: string) => {
    setItems(prev =>
      prev.map(i => {
        if (i.id !== itemId) return i;
        return {
          ...i,
          params: [
            ...i.params,
            {
              name: '',
              label: '',
              unit: '',
              minValue: null,
              maxValue: null,
              matchTolerance: null,
              matchParamId: null,
              isWriteParam: false,
              hardBlock: false,
              sortOrder: i.params.length,
            },
          ],
        };
      })
    );
  };

  const removeItemParam = (itemId: string, paramIdx: number) => {
    setItems(prev =>
      prev.map(i => {
        if (i.id !== itemId) return i;
        return { ...i, params: i.params.filter((_, idx) => idx !== paramIdx) };
      })
    );
  };

  // Collect all params across items for match-param dropdown
  const allParams = filtered.flatMap(item =>
    item.params.map(p => ({ id: p.id, label: `${item.name} → ${p.label || p.name}`, itemId: item.id }))
  );

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-slate-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h2 className="text-lg font-semibold">QC Test Checklist</h2>
      </div>

      {/* Product selector */}
      <select
        value={selectedProduct}
        onChange={e => setSelectedProduct(e.target.value)}
        className="w-full p-3 rounded-lg bg-smx-surface border border-slate-600 text-white"
      >
        {products.map(p => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.code})
          </option>
        ))}
      </select>

      {/* Existing items */}
      {filtered.length === 0 && !showAddForm && (
        <p className="text-slate-400 text-sm text-center py-8">
          No QC test items configured for this product yet.
        </p>
      )}

      {filtered.map((item, itemIdx) => (
        <div key={item.id} className="bg-smx-surface border border-slate-600 rounded-xl overflow-hidden">
          {/* Header */}
          <div
            className="flex items-center gap-3 p-4 cursor-pointer"
            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
          >
            <GripVertical className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="text-sm font-medium text-slate-300 w-6">{itemIdx + 1}.</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{item.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {item.requirePhoto && (
                  <span className="flex items-center gap-1 text-xs text-sky-400">
                    <Camera className="w-3 h-3" /> Photo
                  </span>
                )}
                {item.aiExtract && (
                  <span className="flex items-center gap-1 text-xs text-violet-400">
                    <Bot className="w-3 h-3" /> AI
                  </span>
                )}
                <span className="text-xs text-slate-500">{item.params.length} param{item.params.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            {expandedId === item.id ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </div>

          {/* Expanded detail */}
          {expandedId === item.id && (
            <div className="border-t border-slate-700 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400">Name</label>
                  <input
                    value={item.name}
                    onChange={e => updateItemField(item.id, 'name', e.target.value)}
                    className="w-full mt-1 p-2 rounded bg-slate-800 border border-slate-600 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Sort Order</label>
                  <input
                    type="number"
                    value={item.sortOrder}
                    onChange={e => updateItemField(item.id, 'sortOrder', parseInt(e.target.value) || 0)}
                    onWheel={e => (e.target as HTMLElement).blur()}
                    className="w-full mt-1 p-2 rounded bg-slate-800 border border-slate-600 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.requirePhoto}
                    onChange={e => updateItemField(item.id, 'requirePhoto', e.target.checked)}
                    className="rounded"
                  />
                  <Camera className="w-4 h-4 text-sky-400" /> Require Photo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={item.aiExtract}
                    onChange={e => updateItemField(item.id, 'aiExtract', e.target.checked)}
                    className="rounded"
                  />
                  <Bot className="w-4 h-4 text-violet-400" /> AI Extract Values
                </label>
              </div>

              {/* Parameters */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-300">Parameters</p>
                  <button
                    onClick={() => addItemParam(item.id)}
                    className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
                  >
                    <Plus className="w-3 h-3" /> Add Param
                  </button>
                </div>

                {item.params.map((p, pIdx) => (
                  <ParamRow
                    key={pIdx}
                    param={p}
                    allParams={allParams.filter(ap => ap.itemId !== item.id)}
                    onChange={(field, val) => updateItemParam(item.id, pIdx, field, val)}
                    onRemove={() => removeItemParam(item.id, pIdx)}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => handleUpdate(item)}
                  disabled={saving === item.id}
                  className="flex items-center gap-1 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded text-sm disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving === item.id ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={saving === item.id}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-sm"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Add new item form */}
      {showAddForm ? (
        <div className="bg-smx-surface border border-sky-600/50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-sky-400">New Test Item</p>
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Test name (e.g. Offset, Motor Parameter, Temp)"
            className="w-full p-2 rounded bg-slate-800 border border-slate-600 text-sm"
            autoFocus
          />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newRequirePhoto}
                onChange={e => setNewRequirePhoto(e.target.checked)}
                className="rounded"
              />
              <Camera className="w-4 h-4 text-sky-400" /> Require Photo
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newAiExtract}
                onChange={e => setNewAiExtract(e.target.checked)}
                className="rounded"
              />
              <Bot className="w-4 h-4 text-violet-400" /> AI Extract
            </label>
          </div>

          {/* New params */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-300">Parameters</p>
              <button
                onClick={() => addParam(newParams, setNewParams)}
                className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300"
              >
                <Plus className="w-3 h-3" /> Add Param
              </button>
            </div>
            {newParams.map((p, pIdx) => (
              <ParamRow
                key={pIdx}
                param={p}
                allParams={[]}
                onChange={(field, val) => updateParam(newParams, setNewParams, pIdx, field, val)}
                onRemove={() => removeParam(newParams, setNewParams, pIdx)}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCreate}
              disabled={saving === 'new' || !newName.trim()}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded text-sm disabled:opacity-50"
            >
              {saving === 'new' ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={resetAddForm}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full py-3 rounded-xl border-2 border-dashed border-slate-600 hover:border-sky-500 text-slate-400 hover:text-sky-400 text-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Test Item
        </button>
      )}
    </div>
  );
}

// ── Param Row Component ──
function ParamRow({
  param,
  allParams,
  onChange,
  onRemove,
}: {
  param: Param;
  allParams: { id?: string; label: string; itemId: string }[];
  onChange: (field: string, value: unknown) => void;
  onRemove: () => void;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 grid grid-cols-3 gap-2">
          <input
            value={param.name}
            onChange={e => onChange('name', e.target.value)}
            placeholder="Parameter name"
            className="p-1.5 rounded bg-slate-900 border border-slate-600 text-xs"
          />
          <input
            value={param.label}
            onChange={e => onChange('label', e.target.value)}
            placeholder="Display label"
            className="p-1.5 rounded bg-slate-900 border border-slate-600 text-xs"
          />
          <input
            value={param.unit}
            onChange={e => onChange('unit', e.target.value)}
            placeholder="Unit (e.g. mΩ)"
            className="p-1.5 rounded bg-slate-900 border border-slate-600 text-xs"
          />
        </div>
        <button onClick={onRemove} className="text-red-400 hover:text-red-300 p-1">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-slate-500">Min Value</label>
          <input
            type="number"
            step="any"
            value={param.minValue ?? ''}
            onChange={e => onChange('minValue', e.target.value ? parseFloat(e.target.value) : null)}
            onWheel={e => (e.target as HTMLElement).blur()}
            placeholder="—"
            className="w-full p-1.5 rounded bg-slate-900 border border-slate-600 text-xs"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500">Max Value</label>
          <input
            type="number"
            step="any"
            value={param.maxValue ?? ''}
            onChange={e => onChange('maxValue', e.target.value ? parseFloat(e.target.value) : null)}
            onWheel={e => (e.target as HTMLElement).blur()}
            placeholder="—"
            className="w-full p-1.5 rounded bg-slate-900 border border-slate-600 text-xs"
          />
        </div>
        <div>
          <label className="text-[10px] text-slate-500">Match ± Tolerance</label>
          <input
            type="number"
            step="any"
            value={param.matchTolerance ?? ''}
            onChange={e => onChange('matchTolerance', e.target.value ? parseFloat(e.target.value) : null)}
            onWheel={e => (e.target as HTMLElement).blur()}
            placeholder="—"
            className="w-full p-1.5 rounded bg-slate-900 border border-slate-600 text-xs"
          />
        </div>
      </div>

      {/* Match param selector */}
      {param.matchTolerance != null && allParams.length > 0 && (
        <div>
          <label className="text-[10px] text-slate-500">Must Match Param</label>
          <select
            value={param.matchParamId ?? ''}
            onChange={e => onChange('matchParamId', e.target.value || null)}
            className="w-full p-1.5 rounded bg-slate-900 border border-slate-600 text-xs"
          >
            <option value="">— none —</option>
            {allParams.filter(ap => ap.id).map(ap => (
              <option key={ap.id} value={ap.id}>{ap.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={param.isWriteParam}
            onChange={e => onChange('isWriteParam', e.target.checked)}
            className="rounded"
          />
          Write param
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={param.hardBlock}
            onChange={e => onChange('hardBlock', e.target.checked)}
            className="rounded"
          />
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          Hard block
        </label>
      </div>
    </div>
  );
}
