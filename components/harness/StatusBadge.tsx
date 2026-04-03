'use client';

const STATUS_STYLES: Record<string, string> = {
  PENDING:    'bg-slate-600/30 text-slate-400',
  ACCEPTED:   'bg-blue-600/20 text-blue-400',
  CRIMPING:   'bg-amber-600/20 text-amber-400',
  QC_PENDING: 'bg-purple-600/20 text-purple-400',
  QC_PASSED:  'bg-emerald-600/20 text-emerald-400',
  QC_FAILED:  'bg-red-600/20 text-red-400',
  READY:      'bg-green-600/20 text-green-400',
  DISPATCHED: 'bg-sky-600/20 text-sky-400',
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] || 'bg-slate-600/30 text-slate-400';
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${style}`}>
      {label}
    </span>
  );
}
