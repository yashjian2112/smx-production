import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import HarnessRework from './HarnessRework';

export default async function HarnessReworkPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'HARNESS_PRODUCTION'); } catch { redirect('/dashboard'); }

  return <HarnessRework role={session.role} userId={session.id} />;
}
