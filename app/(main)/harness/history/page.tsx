import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import HarnessHistory from './HarnessHistory';

export default async function HarnessHistoryPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'HARNESS_PRODUCTION'); } catch { redirect('/dashboard'); }

  return <HarnessHistory role={session.role} userId={session.id} />;
}
