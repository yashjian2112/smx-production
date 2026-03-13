import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreateOrderForm } from './CreateOrderForm';
import { OrdersList, type OrderItem } from './OrdersList';

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const isManager = session.role === 'ADMIN' || session.role === 'PRODUCTION_MANAGER';
  const isAdmin   = session.role === 'ADMIN';

  const [rawOrders, products] = await Promise.all([
    prisma.order.findMany({
      include: {
        product: true,
        _count: { select: { units: true } },
        units: { select: { currentStatus: true, currentStage: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    isAdmin
      ? prisma.product.findMany({ where: { active: true }, orderBy: { code: 'asc' } })
      : Promise.resolve([]),
  ]);

  // Serialize dates for client components
  const orders: OrderItem[] = rawOrders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    voltage: o.voltage ?? null,
    product: { name: o.product.name, code: o.product.code },
    _count: { units: o._count.units },
    units: o.units.map((u) => ({ currentStatus: u.currentStatus, currentStage: u.currentStage })),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Orders</h2>
        {isAdmin && <CreateOrderForm products={products} />}
      </div>
      <OrdersList orders={orders} isManager={isManager} />
    </div>
  );
}
