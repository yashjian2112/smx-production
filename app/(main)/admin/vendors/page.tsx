import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { VendorsAdmin } from './VendorsAdmin';

export default async function VendorsAdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN'); } catch { redirect('/dashboard'); }
  return <VendorsAdmin />;
}
