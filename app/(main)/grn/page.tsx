import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import GRNPanel from './GRNPanel';

export default async function GRNPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'INVENTORY_MANAGER'].includes(session.role)) redirect('/dashboard');

  return (
    <main className="min-h-screen pb-24" style={{ background: 'rgb(9,9,11)' }}>
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Goods Receipt</h1>
          <p className="text-zinc-400 text-sm mt-1">Verify arrived goods and update inventory stock</p>
        </div>
        <GRNPanel />
      </div>
    </main>
  );
}
