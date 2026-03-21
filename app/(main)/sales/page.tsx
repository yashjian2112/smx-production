import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
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

  const [proformas, invoices, returns] = await Promise.all([
    prisma.proformaInvoice.findMany({
      where: session.role === 'SALES' ? { createdById: session.id } : {},
      include: {
        client:    { select: { id: true, code: true, customerName: true, globalOrIndian: true } },
        createdBy: { select: { id: true, name: true } },
        _count:    { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),

    // For SALES: only show invoices linked to proformas they created
    prisma.invoice.findMany({
      where: session.role === 'SALES'
        ? { proforma: { createdById: session.id } }
        : {},
      include: {
        client:        { select: { id: true, code: true, customerName: true, globalOrIndian: true } },
        dispatchOrder: { select: { doNumber: true, approvedAt: true, order: { select: { orderNumber: true } } } },
        _count:        { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),

    prisma.returnRequest.findMany({
      where: session.role === 'SALES' ? { reportedById: session.id } : {},
      include: {
        client:     { select: { code: true, customerName: true } },
        reportedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
  ]);

  const serialized = proformas.map((p) => ({
    ...p,
    invoiceDate: p.invoiceDate.toISOString(),
    approvedAt:  p.approvedAt?.toISOString() ?? null,
    createdAt:   p.createdAt.toISOString(),
    updatedAt:   p.updatedAt.toISOString(),
  }));

  const serializedInvoices = invoices.map((inv) => ({
    ...inv,
    createdAt:     inv.createdAt.toISOString(),
    updatedAt:     inv.updatedAt.toISOString(),
    dispatchOrder: inv.dispatchOrder
      ? {
          ...inv.dispatchOrder,
          approvedAt: inv.dispatchOrder.approvedAt?.toISOString() ?? null,
        }
      : null,
  }));

  const serializedReturns = returns.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  const canCreate = session.role === 'ADMIN' || session.role === 'SALES';

  const rawTab = searchParams?.tab;
  const initialTab =
    rawTab === 'invoice' ? 'invoice' :
    rawTab === 'returns' ? 'returns' :
    rawTab === 'status'  ? 'status'  :
    'pi';

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Invoices</h2>
      <ProformaList
        proformas={serialized as any}
        role={session.role}
        initialTab={initialTab as any}
        invoices={serializedInvoices as any}
        returnRequests={serializedReturns as any}
        canCreate={canCreate}
      />
    </div>
  );
}
