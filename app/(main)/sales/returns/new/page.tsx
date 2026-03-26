import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ReturnForm from './ReturnForm';

export default async function NewReturnPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'SALES', 'ACCOUNTS'].includes(session.role)) redirect('/dashboard');

  const clients = await prisma.client.findMany({
    where: { active: true },
    select: { id: true, code: true, customerName: true },
    orderBy: { customerName: 'asc' },
  });

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">New Return</h1>
        <p className="text-zinc-400 text-sm mt-1">Log a customer return request</p>
      </div>
      <ReturnForm clients={clients} />
    </div>
  );
}
