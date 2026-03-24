import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { AnalyticsDashboard } from './AnalyticsDashboard';

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN'); } catch { redirect('/dashboard'); }
  return <AnalyticsDashboard />;
}
