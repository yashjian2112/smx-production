import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import NewSampleForm from './NewSampleForm';

export default async function NewSamplePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'SALES'].includes(session.role)) redirect('/dashboard');

  const [clients, products] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      select: { id: true, code: true, customerName: true },
      orderBy: { customerName: 'asc' },
    }),
    prisma.product.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">New Sample Request</h1>
        <p className="text-zinc-400 text-sm mt-1">Request a product sample for a client</p>
      </div>
      <NewSampleForm clients={clients} products={products} />
    </div>
  );
}
