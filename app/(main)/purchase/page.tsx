import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import PurchasePanel from './PurchasePanel';

const TITLE: Record<string, { heading: string; sub: string }> = {
  PURCHASE_MANAGER:  { heading: 'Procurement',        sub: 'RFQ · Purchase Orders · GAN' },
  INVENTORY_MANAGER: { heading: 'Requirement Orders', sub: 'Review and approve stock requirements' },
  ADMIN:             { heading: 'Procurement',        sub: 'Requirement Orders · RFQ · Purchase Orders · GAN · GRN' },
};

export default async function PurchasePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'PURCHASE_MANAGER', 'INVENTORY_MANAGER'].includes(session.role)) redirect('/dashboard');

  const { heading, sub } = TITLE[session.role] ?? TITLE.ADMIN;

  return (
    <main className="min-h-screen pb-24" style={{ background: 'rgb(9,9,11)' }}>
      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">{heading}</h1>
          <p className="text-zinc-400 text-sm mt-1">{sub}</p>
        </div>
        <PurchasePanel sessionRole={session.role} />
      </div>
    </main>
  );
}
