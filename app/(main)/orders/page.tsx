import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreateOrderForm } from './CreateOrderForm';
import { OrdersList, type OrderItem } from './OrdersList';

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role === 'ACCOUNTS') redirect('/accounts');
  if (session.role === 'QC_USER') redirect('/qc');

  const isManager = session.role === 'ADMIN';
  const isAdmin   = session.role === 'ADMIN';

  const isEmployee = session.role === 'PRODUCTION_EMPLOYEE';

  const [rawOrders, products, clients, myJobCards] = await Promise.all([
    prisma.order.findMany({
      include: {
        product: true,
        client: { select: { id: true, code: true, customerName: true } },
        _count: { select: { units: true } },
        units: { select: { currentStatus: true, currentStage: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    isAdmin
      ? prisma.product.findMany({ where: { active: true }, orderBy: { code: 'asc' } })
      : Promise.resolve([]),
    isAdmin
      ? prisma.client.findMany({ where: { active: true }, orderBy: { customerName: 'asc' }, select: { id: true, code: true, customerName: true } })
      : Promise.resolve([]),
    // For employees: fetch their job cards to know which orders they've accepted
    isEmployee
      ? prisma.jobCard.findMany({
          where: { createdById: session.id },
          select: { orderId: true, stage: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  // Build a set of accepted order IDs for this employee
  const acceptedOrderIds = new Set(myJobCards.map((jc) => jc.orderId));

  // Serialize dates for client components
  const orders: OrderItem[] = rawOrders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    voltage: o.voltage ?? null,
    product: { name: o.product.name, code: o.product.code },
    client: o.client ? { id: o.client.id, code: o.client.code, customerName: o.client.customerName } : null,
    _count: { units: o._count.units },
    units: o.units.map((u) => ({ currentStatus: u.currentStatus, currentStage: u.currentStage })),
    hasMyJobCard: acceptedOrderIds.has(o.id),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Orders</h2>
        {isAdmin && <CreateOrderForm products={products} clients={clients} />}
      </div>
      <OrdersList orders={orders} isManager={isManager} sessionRole={session.role} />
    </div>
  );
}
