import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ChecklistAdmin } from './ChecklistAdmin';

export default async function ChecklistsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER'); } catch { redirect('/dashboard'); }

  const [items, products] = await Promise.all([
    prisma.stageChecklistItem.findMany({
      orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
    }),
    prisma.product.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    }),
  ]);

  return (
    <ChecklistAdmin
      initialItems={JSON.parse(JSON.stringify(items))}
      products={JSON.parse(JSON.stringify(products))}
    />
  );
}
