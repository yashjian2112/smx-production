import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import QCTestAdmin from './QCTestAdmin';

export default async function QCTestsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN'); } catch { redirect('/dashboard'); }

  const [products, testItems] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    }),
    prisma.qCTestItem.findMany({
      where: { active: true },
      include: { params: { orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }],
    }),
  ]);

  return (
    <QCTestAdmin
      products={JSON.parse(JSON.stringify(products))}
      initialItems={JSON.parse(JSON.stringify(testItems))}
    />
  );
}
