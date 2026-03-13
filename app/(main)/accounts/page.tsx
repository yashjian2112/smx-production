import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ProformaList } from '../sales/ProformaList';

export default async function AccountsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const canAccess = ['ADMIN', 'ACCOUNTS'].includes(session.role);
  if (!canAccess) redirect('/dashboard');

  const proformas = await prisma.proformaInvoice.findMany({
    include: {
      client:    { select: { id: true, code: true, customerName: true, globalOrIndian: true } },
      createdBy: { select: { id: true, name: true } },
      _count:    { select: { items: true } },
    },
    orderBy: [
      // Pending approval first
      { status: 'asc' },
      { createdAt: 'desc' },
    ],
    take: 300,
  });

  const serialized = proformas.map((p) => ({
    ...p,
    invoiceDate: p.invoiceDate.toISOString(),
    approvedAt:  p.approvedAt?.toISOString() ?? null,
    createdAt:   p.createdAt.toISOString(),
    updatedAt:   p.updatedAt.toISOString(),
  }));

  const pending = proformas.filter((p) => p.status === 'PENDING_APPROVAL').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Accounts</h2>
          {pending > 0 && (
            <p className="text-xs text-amber-400 mt-0.5">{pending} invoice{pending !== 1 ? 's' : ''} pending approval</p>
          )}
        </div>
        <Link href="/accounts/settings" className="text-sm text-zinc-400 hover:text-white transition-colors border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-2">
          ⚙️ LUT Settings
        </Link>
      </div>
      <ProformaList proformas={serialized as any} role={session.role} />
    </div>
  );
}
