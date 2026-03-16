import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import PurchasePanel from './PurchasePanel';

export default async function PurchasePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'PURCHASE_MANAGER', 'ACCOUNTS'].includes(session.role)) redirect('/dashboard');

  return (
    <main className="min-h-screen pb-24" style={{ background: 'rgb(9,9,11)' }}>
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Purchase</h1>
          <p className="text-zinc-400 text-sm mt-1">Requests · Bidding · Orders · Vendors</p>
        </div>
        <PurchasePanel sessionRole={session.role} />
      </div>
    </main>
  );
}
