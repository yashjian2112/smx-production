import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import HarnessConnectorAdmin from './HarnessConnectorAdmin';

export default async function HarnessConnectorsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN'); } catch { redirect('/dashboard'); }

  const [products, connectors] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, harnessVariants: true },
    }),
    prisma.harnessConnector.findMany({
      where: { active: true },
      orderBy: [{ productId: 'asc' }, { sortOrder: 'asc' }],
    }),
  ]);

  return (
    <HarnessConnectorAdmin
      products={JSON.parse(JSON.stringify(products))}
      initialConnectors={JSON.parse(JSON.stringify(connectors))}
    />
  );
}
