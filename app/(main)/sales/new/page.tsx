import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { CreateProformaForm } from './CreateProformaForm';

export default async function NewProformaPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const canCreate = ['ADMIN', 'SALES', 'ACCOUNTS'].includes(session.role);
  if (!canCreate) redirect('/sales');

  const [clients, products] = await Promise.all([
    prisma.client.findMany({ where: { active: true }, orderBy: { customerName: 'asc' } }),
    prisma.product.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
  ]);

  const title = session.role === 'SALES' ? 'New Proforma Invoice' : 'New Invoice';

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <CreateProformaForm clients={clients as any} products={products} role={session.role} />
    </div>
  );
}
