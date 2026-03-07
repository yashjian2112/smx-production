import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  try {
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER');
  } catch {
    redirect('/dashboard');
  }
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      product: true,
      units: { orderBy: { serialNumber: 'asc' }, include: { assignments: { include: { user: true } } } },
    },
  });
  if (!order) notFound();

  return (
    <div className="space-y-6">
      <Link href="/orders" className="text-slate-400 hover:text-white text-sm">← Orders</Link>
      <div className="bg-smx-surface border border-slate-600 rounded-xl p-4">
        <h2 className="text-xl font-semibold font-mono">{order.orderNumber}</h2>
        <p className="text-slate-400 text-sm">{order.product.name} · {order.units.length} units</p>
        <p className="text-slate-500 text-xs mt-2">Status: {order.status}</p>
      </div>
      <h3 className="font-medium">Units</h3>
      <ul className="space-y-2">
        {order.units.map((u) => (
          <li key={u.id}>
            <Link
              href={`/units/${u.id}`}
              className="block p-3 rounded-lg bg-smx-surface border border-slate-600 hover:border-sky-500"
            >
              <span className="font-mono text-sky-400">{u.serialNumber}</span>
              <span className="text-slate-400 ml-2 text-sm">{u.currentStage.replace(/_/g, ' ')} · {u.currentStatus}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
