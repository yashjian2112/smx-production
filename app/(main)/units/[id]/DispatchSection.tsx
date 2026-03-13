'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Barcode128 } from '@/components/Barcode128';
import { FaceGate } from '@/components/FaceGate';

type Props = {
  unitId: string;
  serialNumber: string;
  productName: string;
  productCode: string;
  orderNumber: string;
  finalAssemblyBarcode: string | null;
  readyForDispatch: boolean;
  dispatchedAt: string | null;   // from timeline log
  dispatchedBy: string | null;   // from timeline log
  sessionRole: string;
};

export function DispatchSection({
  unitId,
  serialNumber,
  productName,
  productCode,
  orderNumber,
  finalAssemblyBarcode,
  readyForDispatch,
  dispatchedAt,
  dispatchedBy,
  sessionRole,
}: Props) {
  const router = useRouter();
  const [pendingDispatch, setPendingDispatch] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const isManager = sessionRole !== 'PRODUCTION_EMPLOYEE';

  async function confirmDispatch() {
    setPendingDispatch(false);
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/units/${unitId}/dispatch`, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? 'Dispatch failed');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="card overflow-hidden"
      style={{
        border: readyForDispatch
          ? '1px solid rgba(34,197,94,0.3)'
          : '1px solid rgba(251,191,36,0.25)',
      }}
    >
      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: readyForDispatch
            ? 'rgba(34,197,94,0.06)'
            : 'rgba(251,191,36,0.05)',
          borderBottom: readyForDispatch
            ? '1px solid rgba(34,197,94,0.15)'
            : '1px solid rgba(251,191,36,0.12)',
        }}
      >
        <div className="flex items-center gap-2.5">
          {/* Truck icon */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke={readyForDispatch ? '#4ade80' : '#fbbf24'}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13" rx="1" />
            <path d="M16 8h4l3 5v4h-7V8z" />
            <circle cx="5.5" cy="18.5" r="2.5" />
            <circle cx="18.5" cy="18.5" r="2.5" />
          </svg>
          <span
            className="text-xs font-bold uppercase tracking-widest"
            style={{ color: readyForDispatch ? '#4ade80' : '#fbbf24' }}
          >
            Controller Dispatch
          </span>
        </div>

        {/* Status badge */}
        <span
          className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest"
          style={readyForDispatch
            ? { background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }
            : { background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }
          }
        >
          {readyForDispatch ? '✓ Dispatched' : 'Ready for Dispatch'}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* ── Final Assembly Barcode ─────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
            Final Assembly Serial Label
          </p>
          {finalAssemblyBarcode ? (
            <div
              className="rounded-xl p-4 flex flex-col items-center gap-2"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                Warranty Void If Removed
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Serial Number
              </p>
              <Barcode128
                value={finalAssemblyBarcode}
                height={56}
                fontSize={11}
                background="transparent"
                lineColor="#e2e8f0"
              />
              <p className="font-mono text-sm font-semibold text-zinc-200 tracking-wider">
                {finalAssemblyBarcode}
              </p>
              <a
                href={`/print/unit/${unitId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.2)', color: '#38bdf8' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print Controller Label
              </a>
            </div>
          ) : (
            <div
              className="rounded-xl p-3 flex items-center gap-2"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-xs text-zinc-600">Barcode not yet generated</p>
            </div>
          )}
        </div>

        {/* ── Unit summary ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {[
            ['Controller', `SMX${productCode} — ${productName}`],
            ['Unit Serial',  serialNumber],
            ['Order No.',    orderNumber],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wide font-medium mb-0.5">{label}</p>
              <p className={`text-sm font-medium ${label === 'Unit Serial' ? 'font-mono text-sky-400' : 'text-zinc-200'}`}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Dispatch info (if already dispatched) ───────────────────── */}
        {readyForDispatch && dispatchedAt && (
          <div
            className="rounded-xl p-3 flex items-start gap-3"
            style={{ background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <div>
              <p className="text-xs font-semibold text-green-400">Controller dispatched</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                {new Date(dispatchedAt).toLocaleString('en-IN', {
                  day: '2-digit', month: 'short', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
                {dispatchedBy && <span> · {dispatchedBy}</span>}
              </p>
            </div>
          </div>
        )}

        {/* ── Dispatch action (managers only, not yet dispatched) ──────── */}
        {!readyForDispatch && isManager && (
          <div className="space-y-2">
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="button"
              onClick={() => setPendingDispatch(true)}
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
              style={{
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.3)',
                color: '#fbbf24',
              }}
            >
              {loading ? (
                <>
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Dispatching…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" rx="1"/>
                    <path d="M16 8h4l3 5v4h-7V8z"/>
                    <circle cx="5.5" cy="18.5" r="2.5"/>
                    <circle cx="18.5" cy="18.5" r="2.5"/>
                  </svg>
                  Mark as Dispatched
                </>
              )}
            </button>
          </div>
        )}

        {/* Face verification gate */}
        {pendingDispatch && (
          <FaceGate
            mode="verify"
            title="Verify identity to dispatch"
            onVerified={confirmDispatch}
            onCancel={() => setPendingDispatch(false)}
          />
        )}
      </div>
    </div>
  );
}
