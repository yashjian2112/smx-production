import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import HarnessDashboard from './HarnessDashboard';

export default async function HarnessPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'HARNESS_PRODUCTION'); } catch { redirect('/dashboard'); }

  return <HarnessDashboard role={session.role} userId={session.id} />;
}
