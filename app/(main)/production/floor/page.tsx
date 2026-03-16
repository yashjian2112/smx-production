import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { FloorView } from './FloorView';

export const dynamic = 'force-dynamic';

export default async function ProductionFloorPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'PRODUCTION_MANAGER'].includes(session.role)) redirect('/dashboard');

  return <FloorView />;
}
