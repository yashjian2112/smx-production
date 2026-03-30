import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { QCWorkPanel } from './QCWorkPanel';

export const dynamic = 'force-dynamic';

export default async function QCWorkPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const allowed = ['ADMIN', 'PRODUCTION_MANAGER', 'PRODUCTION_EMPLOYEE', 'QC_USER'];
  if (!allowed.includes(session.role)) redirect('/dashboard');

  return <QCWorkPanel role={session.role} />;
}
