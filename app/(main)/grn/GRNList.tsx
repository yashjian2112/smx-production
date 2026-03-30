'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type GRNItem = {
  rawMaterial: { name: string; unit: string; code: string };
  quantity: number;
};

type GRNBatch = {
  id: string;
  batchCode: string;
  quantity: number;
  remainingQty: number;
  condition: string;
};

type GRNRow = {
  id: string;
  grnNumber: string;
  receivedAt: string;
  notes: string | null;
  receivedBy: { name: string };
  purchaseOrder: {
    poNumber: string;
    vendor: { name: string; code: string };
    purchaseRequest: { requestNumber: string } | null;
  };
  items: GRNItem[];
  batches: GRNBatch[];
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function GRNList() {
  const [grns, setGrns] = useState<GRNRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/inventory/grn')
      .then((r) => r.json())
      .then((data) => { setGrns(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center text-zinc-500 py-12 text-sm">Loading...</div>;
  if (grns.length === 0) return <div className="card p-6 text-center"><p className="text-zinc-500 text-sm">No GRNs found.</p></div>;

  return (
    <div className="space-y-2">
      {grns.map((grn) => {
        const isOpen = expandedId === grn.id;
        const totalQty = grn.items.reduce((s, i) => s + i.quantity, 0);
        return (
          <div key={grn.id} className="card overflow-hidden">
            <button
              onClick={() => setExpandedId(isOpen ? null : grn.id)}
              className="w-full p-4 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm text-white">{grn.grnNumber}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-700/40">
                      Received
                    </span>
                  </div>
                  <p className="text-zinc-400 text-sm mt-0.5">
                    {grn.purchaseOrder.vendor.name} ({grn.purchaseOrder.vendor.code})
                  </p>
                  <p className="text-zinc-600 text-xs mt-0.5">
                    PO: {grn.purchaseOrder.poNumber}
                    {grn.purchaseOrder.purchaseRequest && ` · PR: ${grn.purchaseOrder.purchaseRequest.requestNumber}`}
                    {' · '}{fmtDate(grn.receivedAt)}
                    {' · '}{grn.items.length} item{grn.items.length !== 1 ? 's' : ''}
                    {' · '}{totalQty} pcs
                    {' · '}by {grn.receivedBy.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/print/grn-serials/${grn.id}`}
                    target="_blank"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] text-sky-400 hover:text-sky-300 px-2 py-1 rounded bg-sky-900/20 border border-sky-700/30"
                  >
                    Print Labels
                  </Link>
                  <svg
                    className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-zinc-800 p-4 space-y-3">
                {grn.notes && (
                  <p className="text-xs text-zinc-500">Notes: {grn.notes}</p>
                )}

                <div>
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">Items Received</p>
                  <div className="space-y-1">
                    {grn.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-zinc-900/50">
                        <span className="text-zinc-300">
                          <span className="font-mono text-zinc-500 text-xs mr-1.5">{item.rawMaterial.code}</span>
                          {item.rawMaterial.name}
                        </span>
                        <span className="text-zinc-400 font-mono text-xs">{item.quantity} {item.rawMaterial.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {grn.batches.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1.5">Batches Created</p>
                    <div className="space-y-1">
                      {grn.batches.map((batch) => (
                        <div key={batch.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-zinc-900/50">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-white">{batch.batchCode}</span>
                            <span className={`text-[10px] px-1 py-0.5 rounded ${
                              batch.condition === 'GOOD' ? 'bg-emerald-900/30 text-emerald-400' :
                              batch.condition === 'DAMAGED' ? 'bg-amber-900/30 text-amber-400' :
                              'bg-red-900/30 text-red-400'
                            }`}>{batch.condition}</span>
                          </div>
                          <span className="text-zinc-400 font-mono text-xs">
                            {batch.remainingQty}/{batch.quantity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
