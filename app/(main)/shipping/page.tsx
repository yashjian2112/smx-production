import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ShippingPanel } from './ShippingPanel';

export const dynamic = 'force-dynamic';

export default async function ShippingPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const allowed = ['ADMIN', 'ACCOUNTS', 'SHIPPING', 'PACKING'];
  if (!allowed.includes(session.role)) redirect('/dashboard');

  return (
    <ShippingPanel
      sessionRole={session.role}
      sessionName={session.name}
    />
  );
}
