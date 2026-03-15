import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ProformaList } from './ProformaList';

export default async function SalesPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await getSession();
  if (!session) redirect('/login');

  const canAccess = ['ADMIN', 'SALES', 'ACCOUNTS', 'PRODUCTION_MANAGER'].includes(session.role);
  if (!canAccess) redirect('/dashboard');

  const proformas = await prisma.proformaInvoice.findMany({
    where: session.role === 'SALES' ? { createdById: session.id } : {},
    include: {
      client:    { select: { id: true, code: true, customerName: true, globalOrIndian: true } },
      createdBy: { select: { id: true, name: true } },
      _count:    { select: { items: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  const serialized = proformas.map((p) => ({
    ...p,
    invoiceDate: p.invoiceDate.toISOString(),
    approvedAt:  p.approvedAt?.toISOString() ?? null,
    createdAt:   p.createdAt.toISOString(),
    updatedAt:   p.updatedAt.toISOString(),
  }));

  const canCreate = session.role === 'ADMIN' || session.role === 'SALES';

  const rawTab = searchParams?.tab;
  const initialTab =
    rawTab === 'invoice' ? 'invoice' :
    rawTab === 'returns' ? 'returns' :
    'pi';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Invoices</h2>
        {canCreate && (
          <Link href="/sales/new" className="btn-primary py-2 px-4 text-sm tap-target">
            + New
          </Link>
        )}
      </div>
      <ProformaList proformas={serialized as any} role={session.role} initialTab={initialTab} />
    </div>
  );
}
