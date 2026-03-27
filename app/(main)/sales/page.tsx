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

  const canAccess = ['ADMIN', 'SALES', 'ACCOUNTS'].includes(session.role);
  if (!canAccess) redirect('/dashboard');

  const [proformas, invoices, returns, samples, implGoods] = await Promise.all([
    prisma.proformaInvoice.findMany({
      where: session.role === 'SALES' ? { createdById: session.id } : {},
      include: {
        client:    { select: { id: true, code: true, customerName: true, globalOrIndian: true } },
        createdBy: { select: { id: true, name: true } },
        _count:    { select: { items: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            holdReason: true,
            quantity: true,
            dueDate: true,
            _count: { select: { notes: true } },
            units: {
              select: {
                currentStage:     true,
                currentStatus:    true,
                readyForDispatch: true,
                dispatchedAt:     true,
              },
            },
            dispatchOrders: {
              where:  { status: 'APPROVED' },
              select: {
                id:          true,
                doNumber:    true,
                dispatchQty: true,
                approvedAt:  true,
                invoices: {
                  select: { id: true, invoiceNumber: true, notes: true },
                },
              },
              orderBy: { approvedAt: 'asc' },
            },
          },
        },
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

    // Samples — ADMIN sees all, SALES sees own
    ['ADMIN', 'SALES'].includes(session.role)
      ? prisma.sampleRequest.findMany({
          where: session.role === 'SALES' ? { requestedById: session.id } : {},
          select: {
            id: true,
            sampleNumber: true,
            status: true,
            quantity: true,
            description: true,
            notes: true,
            createdAt: true,
            approvedAt: true,
            dispatchedAt: true,
            returnedAt: true,
            client:      { select: { id: true, code: true, customerName: true } },
            product:     { select: { id: true, code: true, name: true } },
            requestedBy: { select: { id: true, name: true } },
            approvedBy:  { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        })
      : Promise.resolve([]),

    // Implementation Goods — ADMIN sees all, SALES sees own
    ['ADMIN', 'SALES'].includes(session.role)
      ? prisma.implementationGood.findMany({
          where: session.role === 'SALES' ? { createdById: session.id } : {},
          select: {
            id: true,
            igNumber: true,
            status: true,
            description: true,
            items: true,
            receivedDate: true,
            expectedReturn: true,
            returnedDate: true,
            purpose: true,
            notes: true,
            createdAt: true,
            client:    { select: { id: true, code: true, customerName: true } },
            createdBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        })
      : Promise.resolve([]),
  ]);

  const serialized = proformas.map((p) => ({
    ...p,
    invoiceDate: p.invoiceDate.toISOString(),
    approvedAt:  p.approvedAt?.toISOString() ?? null,
    createdAt:   p.createdAt.toISOString(),
    updatedAt:   p.updatedAt.toISOString(),
    order: p.order
      ? {
          ...p.order,
          dueDate: p.order.dueDate?.toISOString() ?? null,
          dispatchOrders: p.order.dispatchOrders.map((d) => ({
            ...d,
            approvedAt: d.approvedAt?.toISOString() ?? null,
          })),
        }
      : null,
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

  const serializedSamples = samples.map((s) => ({
    ...s,
    createdAt:    s.createdAt.toISOString(),
    approvedAt:   s.approvedAt?.toISOString()   ?? null,
    dispatchedAt: s.dispatchedAt?.toISOString() ?? null,
    returnedAt:   s.returnedAt?.toISOString()   ?? null,
  }));

  const serializedImplGoods = implGoods.map((g) => ({
    ...g,
    receivedDate:   g.receivedDate.toISOString(),
    expectedReturn: g.expectedReturn?.toISOString() ?? null,
    returnedDate:   g.returnedDate?.toISOString()   ?? null,
    createdAt:      g.createdAt.toISOString(),
  }));

  const canCreate = session.role === 'ADMIN' || session.role === 'SALES';

  const rawTab = searchParams?.tab;
  const initialTab =
    rawTab === 'invoice'  ? 'invoice'  :
    rawTab === 'returns'  ? 'returns'  :
    rawTab === 'status'   ? 'status'   :
    rawTab === 'samples'  ? 'samples'  :
    rawTab === 'impl'     ? 'impl'     :
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
        samples={serializedSamples as any}
        implGoods={serializedImplGoods as any}
      />
    </div>
  );
}
