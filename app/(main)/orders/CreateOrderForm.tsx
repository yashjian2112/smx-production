'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FaceGate } from '@/components/FaceGate';

type Product = { id: string; code: string; name: string };

const VOLTAGES = ['24V','36V','48V','60V','72V','84V','96V','108V','120V','130V'];

export function CreateOrderForm({ products }: { products: Product[] }) {
  const [open, setOpen] = useState(false);
  const [showFace, setShowFace] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [voltageFrom, setVoltageFrom] = useState('48V');
  const [voltageTo, setVoltageTo] = useState('48V');
  const [quantity, setQuantity] = useState(10);
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function doCreate() {
    setShowFace(false);
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNumber: orderNumber.trim(),
          productId,
          voltage: voltageFrom === voltageTo ? voltageFrom : `${voltageFrom}-${voltageTo}`,
          quantity,
          dueDate: dueDate || undefined,
          priority,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed');
        return;
      }
      setOpen(false);
      setOrderNumber('');
      setVoltageFrom('48V');
      setVoltageTo('48V');
      setQuantity(10);
      setDueDate('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (showFace) {
    return (
      <FaceGate
        mode="verify"
        title="Verify your identity to create order"
        onVerified={doCreate}
        onCancel={() => setShowFace(false)}
      />
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary py-2 px-4 text-sm tap-target"
      >
        Create order
      </button>
    );
  }

  function handleSubmit(e: { preventDefault: () => void }) {
    e.preventDefault();
    setShowFace(true);
  }

  const labelCls = 'block text-[11px] font-medium text-zinc-500 tracking-widest uppercase mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="card p-6 w-full max-w-md max-h-[90vh] overflow-y-auto space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold">Create order</h3>
          <button type="button" onClick={() => setOpen(false)} className="text-zinc-600 hover:text-zinc-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm p-3 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </p>
        )}

        <div>
          <label className={labelCls}>Work order number</label>
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            className="input-field text-sm"
            placeholder="e.g. WO-2026-001"
            required
          />
        </div>

        <div>
          <label className={labelCls}>Product</label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="select-field text-sm"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Voltage range</label>
          <div className="flex items-center gap-2">
            <select
              value={voltageFrom}
              onChange={(e) => setVoltageFrom(e.target.value)}
              className="select-field text-sm flex-1"
            >
              {VOLTAGES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <span className="text-zinc-500 text-sm shrink-0">to</span>
            <select
              value={voltageTo}
              onChange={(e) => setVoltageTo(e.target.value)}
              className="select-field text-sm flex-1"
            >
              {VOLTAGES.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Quantity</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
            className="input-field text-sm"
          />
        </div>

        <div>
          <label className={labelCls}>Due date <span className="normal-case text-zinc-700">(optional)</span></label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="input-field text-sm"
          />
        </div>

        <div>
          <label className={labelCls}>Priority</label>
          <input
            type="number"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
            className="input-field text-sm"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={loading} className="btn-primary flex-1 py-2.5 text-sm">
            {loading ? 'Creating…' : 'Create order'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="btn-ghost px-4 py-2.5 text-sm">
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
