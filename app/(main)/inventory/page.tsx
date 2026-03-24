import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import InventoryPanel from './InventoryPanel';

export default async function InventoryPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'INVENTORY_MANAGER', 'STORE_MANAGER'].includes(session.role)) redirect('/dashboard');

  return (
    <main className="min-h-screen pb-24" style={{ background: 'rgb(9,9,11)' }}>
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Inventory</h1>
          <p className="text-zinc-400 text-sm mt-1">Materials · GRN · Reports · Settings</p>
        </div>
        <InventoryPanel sessionRole={session.role} />
      </div>
    </main>
  );
}
