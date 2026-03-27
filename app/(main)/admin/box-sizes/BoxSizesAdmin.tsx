'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type BoxSizeRow = {
  id:        string;
  name:      string;
  lengthCm:  number;
  widthCm:   number;
  heightCm:  number;
  active:    boolean;
  createdAt: string | Date;
};

const emptyForm = { name: '', lengthCm: '', widthCm: '', heightCm: '' };
type Modal = { type: 'add' } | { type: 'edit'; boxSize: BoxSizeRow } | null;

export function BoxSizesAdmin({ boxSizes: initial }: { boxSizes: BoxSizeRow[] }) {
  const router = useRouter();
  const [boxSizes, setBoxSizes] = useState<BoxSizeRow[]>(initial);
  const [modal, setModal]       = useState<Modal>(null);
  const [form, setForm]         = useState({ ...emptyForm });
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

  function openAdd() {
    setForm({ ...emptyForm });
    setError('');
    setModal({ type: 'add' });
  }

  function openEdit(b: BoxSizeRow) {
    setForm({
      name:     b.name,
      lengthCm: String(b.lengthCm),
      widthCm:  String(b.widthCm),
      heightCm: String(b.heightCm),
    });
    setError('');
    setModal({ type: 'edit', boxSize: b });
  }

  function closeModal() {
    setModal(null);
    setError('');
  }

  function fieldChange(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    const l = parseFloat(form.lengthCm), w = parseFloat(form.widthCm), h = parseFloat(form.heightCm);
    if (isNaN(l) || l <= 0 || isNaN(w) || w <= 0 || isNaN(h) || h <= 0) {
      setError('All dimensions must be positive numbers');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const body = { name: form.name.trim(), lengthCm: l, widthCm: w, heightCm: h };
      if (modal?.type === 'add') {
        const res = await fetch('/api/box-sizes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await res.json() as { boxSize?: BoxSizeRow; error?: string };
        if (!res.ok) { setError(data.error ?? 'Failed to create'); return; }
        setBoxSizes((prev) => [...prev, data.boxSize!]);
      } else if (modal?.type === 'edit') {
        const res = await fetch(`/api/box-sizes/${modal.boxSize.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const data = await res.json() as { boxSize?: BoxSizeRow; error?: string };
        if (!res.ok) { setError(data.error ?? 'Failed to update'); return; }
        setBoxSizes((prev) => prev.map((b) => b.id === modal.boxSize.id ? data.boxSize! : b));
      }
      closeModal();
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(b: BoxSizeRow) {
    setToggling(b.id);
    try {
      const res = await fetch(`/api/box-sizes/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !b.active }),
      });
      const data = await res.json() as { boxSize?: BoxSizeRow; error?: string };
      if (res.ok) {
        setBoxSizes((prev) => prev.map((x) => x.id === b.id ? data.boxSize! : x));
      }
    } catch {
      // ignore
    } finally {
      setToggling(null);
    }
  }

  const active   = boxSizes.filter((b) => b.active);
  const inactive = boxSizes.filter((b) => !b.active);

  return (
    <>
      {/* Add button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#0ea5e9', color: '#fff' }}
        >
          + Add Box Size
        </button>
      </div>

      {/* Active sizes */}
      {active.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Active ({active.length})</div>
          <div className="flex flex-col gap-2">
            {active.map((b) => (
              <BoxSizeCard key={b.id} boxSize={b} onEdit={openEdit} onToggle={toggleActive} toggling={toggling === b.id} />
            ))}
          </div>
        </div>
      )}

      {/* Inactive sizes */}
      {inactive.length > 0 && (
        <div className="space-y-2 mt-4">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Inactive ({inactive.length})</div>
          <div className="flex flex-col gap-2 opacity-60">
            {inactive.map((b) => (
              <BoxSizeCard key={b.id} boxSize={b} onEdit={openEdit} onToggle={toggleActive} toggling={toggling === b.id} />
            ))}
          </div>
        </div>
      )}

      {boxSizes.length === 0 && (
        <div
          className="rounded-xl p-8 text-center text-sm text-zinc-500"
          style={{ border: '1px dashed rgba(255,255,255,0.1)' }}
        >
          No box sizes yet. Add your first box size to get started.
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="card w-full max-w-sm mx-4 p-5 space-y-4">
            <div className="text-base font-semibold text-white">
              {modal.type === 'add' ? 'Add Box Size' : 'Edit Box Size'}
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Name <span className="text-rose-400">*</span></label>
                <input
                  value={form.name}
                  onChange={(e) => fieldChange('name', e.target.value)}
                  placeholder="e.g. Small, Large, A4 Box"
                  className="input-field text-sm w-full"
                />
              </div>
              <div className="text-xs text-zinc-500 font-medium">Dimensions (cm)</div>
              <div className="grid grid-cols-3 gap-2">
                {(['lengthCm', 'widthCm', 'heightCm'] as const).map((field, i) => (
                  <div key={field}>
                    <label className="text-xs text-zinc-400 mb-1 block">{['Length', 'Width', 'Height'][i]}</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={form[field]}
                      onChange={(e) => fieldChange(field, e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="0"
                      className="input-field text-sm w-full"
                    />
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-xs text-rose-400">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: '#0ea5e9', color: '#fff' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BoxSizeCard({
  boxSize,
  onEdit,
  onToggle,
  toggling,
}: {
  boxSize:  BoxSizeRow;
  onEdit:   (b: BoxSizeRow) => void;
  onToggle: (b: BoxSizeRow) => void;
  toggling: boolean;
}) {
  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center justify-between gap-3"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white">{boxSize.name}</div>
        <div className="text-xs text-zinc-500 mt-0.5">
          {boxSize.lengthCm} × {boxSize.widthCm} × {boxSize.heightCm} cm
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onEdit(boxSize)}
          className="text-xs px-2.5 py-1 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.06)', color: '#a1a1aa', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onToggle(boxSize)}
          disabled={toggling}
          className="text-xs px-2.5 py-1 rounded-lg disabled:opacity-40"
          style={boxSize.active
            ? { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }
            : { background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)' }}
        >
          {toggling ? '…' : boxSize.active ? 'Deactivate' : 'Activate'}
        </button>
      </div>
    </div>
  );
}
