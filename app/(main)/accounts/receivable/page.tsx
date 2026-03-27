import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function fmtDate(d: Date | string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtAmt(n: number, currency = 'INR') {
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  APPROVED:       { bg: 'rgba(251,191,36,0.1)',  color: '#fbbf24', label: 'Unpaid'   },
  PARTIALLY_PAID: { bg: 'rgba(56,189,248,0.1)',  color: '#38bdf8', label: 'Partial'  },
  PAID:           { bg: 'rgba(34,197,94,0.1)',   color: '#4ade80', label: 'Paid'     },
  OVERDUE:        { bg: 'rgba(239,68,68,0.1)',   color: '#f87171', label: 'Overdue'  },
};

export default async function ARPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'ACCOUNTS'].includes(session.role)) redirect('/dashboard');

  const invoices = await prisma.invoice.findMany({
    include: {
      client: { select: { code: true, customerName: true, globalOrIndian: true } },
      dispatchOrder: {
        select: {
          doNumber: true,
          approvedAt: true,
          order: { select: { orderNumber: true } },
        },
      },
      payments: {
        select: { id: true, amount: true, paymentDate: true, method: true, reference: true },
        orderBy: { paymentDate: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const totalOutstanding = invoices
    .filter(i => i.status !== 'PAID')
    .reduce((sum, i) => sum + Math.max(0, i.totalAmount - i.paidAmount), 0);

  const overdueCount  = invoices.filter(i => i.status === 'OVERDUE').length;
  const unpaidCount   = invoices.filter(i => i.status === 'APPROVED').length;
  const partialCount  = invoices.filter(i => i.status === 'PARTIALLY_PAID').length;
  const paidCount     = invoices.filter(i => i.status === 'PAID').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Accounts Receivable</h2>
        <p className="text-zinc-500 text-sm mt-0.5">Outstanding payments from customers</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Outstanding',  value: fmtAmt(totalOutstanding), color: '#fbbf24' },
          { label: 'Overdue',      value: String(overdueCount),      color: '#f87171' },
          { label: 'Partial',      value: String(partialCount),      color: '#38bdf8' },
          { label: 'Paid',         value: String(paidCount),         color: '#4ade80' },
        ].map(c => (
          <div key={c.label} className="card p-4">
            <p className="text-zinc-500 text-xs mb-1">{c.label}</p>
            <p className="text-base font-bold" style={{ color: c.color }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Invoice list */}
      <div className="space-y-2">
        {unpaidCount + partialCount + overdueCount === 0 && (
          <div className="card p-8 text-center">
            <p className="text-zinc-500 text-sm">No outstanding invoices.</p>
          </div>
        )}

        {invoices
          .filter(i => i.status !== 'PAID')
          .map(inv => {
            const ss      = STATUS_STYLE[inv.status] ?? STATUS_STYLE.APPROVED;
            const outstanding = Math.max(0, inv.totalAmount - inv.paidAmount);
            return (
              <div key={inv.id} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm text-white">{inv.invoiceNumber}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: ss.bg, color: ss.color }}>
                        {ss.label}
                      </span>
                      <span className="text-xs text-zinc-500">{inv.currency}</span>
                    </div>
                    <p className="text-zinc-400 text-sm mt-1">
                      {inv.client.customerName}
                      {inv.dispatchOrder && (
                        <span className="text-zinc-600"> · {inv.dispatchOrder.doNumber}</span>
                      )}
                    </p>
                    <p className="text-zinc-600 text-xs mt-0.5">
                      {fmtDate(inv.createdAt)}
                      {inv.dispatchOrder?.approvedAt && (
                        <> · Dispatched {fmtDate(inv.dispatchOrder.approvedAt)}</>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white font-semibold text-sm">{fmtAmt(outstanding, inv.currency)}</p>
                    <p className="text-zinc-500 text-xs">of {fmtAmt(inv.totalAmount, inv.currency)}</p>
                    {inv.paidAmount > 0 && (
                      <p className="text-green-400 text-xs">{fmtAmt(inv.paidAmount, inv.currency)} paid</p>
                    )}
                  </div>
                </div>

                {/* Payment history */}
                {inv.payments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1">
                    {inv.payments.map(p => (
                      <div key={p.id} className="flex justify-between text-xs text-zinc-500">
                        <span>{fmtDate(p.paymentDate)} · {p.method.replace(/_/g, ' ')}{p.reference ? ` · ${p.reference}` : ''}</span>
                        <span className="text-green-400">+{fmtAmt(p.amount, inv.currency)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* Paid invoices (collapsed summary) */}
      {paidCount > 0 && (
        <div className="card p-4">
          <p className="text-zinc-500 text-sm">{paidCount} paid invoice{paidCount !== 1 ? 's' : ''} — fully settled.</p>
        </div>
      )}
    </div>
  );
}
