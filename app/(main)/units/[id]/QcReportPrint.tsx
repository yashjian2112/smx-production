'use client';

import Link from 'next/link';

export function QcReportPrint({
  unitId,
  qcBarcode,
  result,
  date,
}: {
  unitId: string;
  qcBarcode: string;
  result: string;
  date: string;
}) {
  const isPass = result === 'PASS';
  const isFail = result === 'FAIL';

  return (
    <div
      className="card p-4"
      style={{ border: `1px solid ${isPass ? 'rgba(34,197,94,0.25)' : isFail ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.08)'}` }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-5 rounded-full"
            style={{ background: isPass ? '#22c55e' : isFail ? '#ef4444' : '#94a3b8' }}
          />
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">QC Test Certificate</p>
        </div>
        {/* Result badge */}
        <span
          className="text-xs font-bold px-3 py-1 rounded-full tracking-widest"
          style={{
            background: isPass ? 'rgba(34,197,94,0.12)' : isFail ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.1)',
            color: isPass ? '#4ade80' : isFail ? '#f87171' : '#94a3b8',
            border: `1px solid ${isPass ? 'rgba(34,197,94,0.3)' : isFail ? 'rgba(239,68,68,0.3)' : 'rgba(148,163,184,0.2)'}`,
          }}
        >
          {result}
        </span>
      </div>

      {/* Info row */}
      <div className="flex gap-4 flex-wrap mb-4">
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wide font-medium mb-0.5">QC Barcode</p>
          <p className="font-mono text-sm font-bold text-sky-400">{qcBarcode}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-600 uppercase tracking-wide font-medium mb-0.5">Test Date</p>
          <p className="text-sm text-zinc-300">{date}</p>
        </div>
      </div>

      {/* Action */}
      <Link
        href={`/print/qc/${unitId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-colors"
        style={{
          background: 'rgba(15,23,42,0.8)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#e2e8f0',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
        Print QC Certificate
      </Link>
    </div>
  );
}
