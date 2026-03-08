import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ChecklistAdmin } from './ChecklistAdmin';

export default async function ChecklistsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER'); } catch { redirect('/dashboard'); }

  const items = await prisma.stageChecklistItem.findMany({
    orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
  });

  return <ChecklistAdmin initialItems={JSON.parse(JSON.stringify(items))} />;
}
