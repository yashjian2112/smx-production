import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ClientsAdmin } from '@/app/(main)/admin/clients/ClientsAdmin';

export default async function SalesClientsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  if (!['ADMIN', 'SALES'].includes(session.role)) redirect('/sales');

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
