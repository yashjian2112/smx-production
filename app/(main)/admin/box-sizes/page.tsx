import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { BoxSizesAdmin } from './BoxSizesAdmin';

export default async function BoxSizesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER'); } catch { redirect('/dashboard'); }

  const boxSizes = await prisma.boxSize.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Box Sizes</h2>
      <BoxSizesAdmin boxSizes={boxSizes} />
    </div>
  );
}
