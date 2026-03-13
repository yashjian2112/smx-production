import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ClientsAdmin } from './ClientsAdmin';

export default async function ClientsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN'); } catch { redirect('/dashboard'); }

  const clients = await prisma.client.findMany({
    orderBy: { customerName: 'asc' },
    include: { _count: { select: { orders: true } } },
  });

  return (
    <div className="space-y-6">
      <ClientsAdmin clients={clients} />
    </div>
  );
}
