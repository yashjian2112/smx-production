import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { GRNList } from './GRNList';

export const dynamic = 'force-dynamic';

export default async function GRNPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const canAccess = ['ADMIN', 'STORE_MANAGER', 'INVENTORY_MANAGER', 'PURCHASE_MANAGER'].includes(session.role);
  if (!canAccess) redirect('/dashboard');

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Goods Receipt Notes</h2>
      <GRNList />
    </div>
  );
}
