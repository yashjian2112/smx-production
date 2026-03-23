import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import BOMAdmin from './BOMAdmin';

export default async function BOMAdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN'); } catch { redirect('/dashboard'); }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">BOM Management</h2>
        <p className="text-zinc-400 text-sm mt-1">Bill of Materials — components required per product per stage</p>
      </div>
      <BOMAdmin />
    </div>
  );
}
