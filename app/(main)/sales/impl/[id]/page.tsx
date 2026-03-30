import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import IGDetail from './IGDetail';

export default async function IGDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const allowed = ['ADMIN', 'SALES', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER', 'ACCOUNTS', 'PACKING', 'PRODUCTION_EMPLOYEE'];
  if (!allowed.includes(session.role)) redirect('/dashboard');

  return <IGDetail igId={params.id} role={session.role} userId={session.id} />;
}
