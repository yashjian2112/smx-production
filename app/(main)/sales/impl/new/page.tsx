import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import NewIGForm from './NewIGForm';

export default async function NewIGPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') redirect('/dashboard');

  const clients = await prisma.client.findMany({
    where: { active: true },
    select: { id: true, code: true, customerName: true },
    orderBy: { customerName: 'asc' },
  });

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">New Implementation Goods Entry</h1>
        <p className="text-zinc-400 text-sm mt-1">Record goods sent to a client for implementation</p>
      </div>
      <NewIGForm clients={clients} />
    </div>
  );
}
