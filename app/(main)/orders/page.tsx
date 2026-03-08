import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreateOrderForm } from './CreateOrderForm';

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try {
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER');
  } catch {
    redirect('/dashboard');
  }

  const orders = await prisma.order.findMany({
    include: { product: true, _count: { select: { units: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const products = await prisma.product.findMany({ where: { active: true }, orderBy: { code: 'asc' } });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Orders</h2>
        <CreateOrderForm products={products} />
      </div>
      <div className="space-y-2">
        {orders.length === 0 ? (
          <p className="text-zinc-600 text-sm">No orders yet. Create one above.</p>
        ) : (
          orders.map((o) => (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="card-interactive block p-4"
            >
              <div className="flex justify-between items-start">
                <span className="font-mono font-medium text-sm">{o.orderNumber}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  o.status === 'ACTIVE'
                    ? 'text-green-400'
                    : 'text-zinc-500'
                }`}
                  style={o.status === 'ACTIVE'
                    ? { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }
                    : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }
                  }
                >
                  {o.status}
                </span>
              </div>
              <p className="text-zinc-500 text-sm mt-1">{o.product.name} · {o._count.units} units</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
