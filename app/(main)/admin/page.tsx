import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession, requireRole } from '@/lib/auth';

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN'); } catch { redirect('/dashboard'); }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Admin</h2>
      <div className="grid grid-cols-2 gap-4">
        <Link href="/admin/products" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2">⚙️</div>
          <p className="font-medium">Products</p>
          <p className="text-slate-400 text-xs mt-1">Manage product catalogue</p>
        </Link>
        <Link href="/admin/users" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2">👤</div>
          <p className="font-medium">Users</p>
          <p className="text-slate-400 text-xs mt-1">Manage users & face enroll</p>
        </Link>
        <Link href="/admin/clients" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2">🏢</div>
          <p className="font-medium">Clients</p>
          <p className="text-slate-400 text-xs mt-1">Manage customers & billing info</p>
        </Link>
        <Link href="/admin/checklists" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2">✅</div>
          <p className="font-medium">Checklists</p>
          <p className="text-slate-400 text-xs mt-1">AI quality checks per stage</p>
        </Link>
      </div>
    </div>
  );
}
