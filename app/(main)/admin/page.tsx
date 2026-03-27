import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Building2, Package, ClipboardList, BarChart3, Settings, User, CheckSquare, Factory, Landmark, TrendingUp } from 'lucide-react';

/** Auto-run any pending DB enum migrations so Vercel deploys self-heal */
async function runPendingMigrations() {
  try {
    // Add PACKING to Role enum if not present
    const res = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'Role' AND e.enumlabel = 'PACKING'
      ) AS exists
    `;
    if (!res[0]?.exists) {
      await prisma.$executeRaw`ALTER TYPE "Role" ADD VALUE 'PACKING'`;
      console.log('[migration] Added PACKING to Role enum');
    }
  } catch (e) {
    // Non-fatal — log and continue
    console.warn('[migration] PACKING enum migration skipped:', e);
  }
}

export default async function AdminPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN'); } catch { redirect('/dashboard'); }

  // Self-healing migration — runs once, no-ops after
  await runPendingMigrations();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Admin</h2>
      <div className="grid grid-cols-2 gap-4">
        <Link href="/admin/products" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2 flex justify-center"><Settings className="w-5 h-5" /></div>
          <p className="font-medium">Products</p>
          <p className="text-slate-400 text-xs mt-1">Manage product catalogue</p>
        </Link>
        <Link href="/admin/users" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2 flex justify-center"><User className="w-5 h-5" /></div>
          <p className="font-medium">Users</p>
          <p className="text-slate-400 text-xs mt-1">Manage users & face enroll</p>
        </Link>
        <Link href="/admin/clients" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2 flex justify-center"><Building2 className="w-5 h-5" /></div>
          <p className="font-medium">Clients</p>
          <p className="text-slate-400 text-xs mt-1">Manage customers & billing info</p>
        </Link>
        <Link href="/admin/checklists" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2 flex justify-center"><CheckSquare className="w-5 h-5" /></div>
          <p className="font-medium">Checklists</p>
          <p className="text-slate-400 text-xs mt-1">AI quality checks per stage</p>
        </Link>
        <Link href="/admin/box-sizes" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2 flex justify-center"><Package className="w-5 h-5" /></div>
          <p className="font-medium">Box Sizes</p>
          <p className="text-slate-400 text-xs mt-1">Predefined box dimensions for packing</p>
        </Link>
        <Link href="/admin/bom" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2 flex justify-center"><ClipboardList className="w-5 h-5" /></div>
          <p className="font-medium">BOM</p>
          <p className="text-slate-400 text-xs mt-1">Bill of Materials per product & stage</p>
        </Link>
        <Link href="/admin/analytics" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2 flex justify-center"><BarChart3 className="w-5 h-5" /></div>
          <p className="font-medium">Analytics</p>
          <p className="text-slate-400 text-xs mt-1">Procurement spend, vendors, AI insights</p>
        </Link>
        <Link href="/admin/vendors" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2 flex justify-center"><Factory className="w-5 h-5" /></div>
          <p className="font-medium">Vendors</p>
          <p className="text-slate-400 text-xs mt-1">Manage vendors &amp; categories</p>
        </Link>
        <Link href="/admin/price-breakdown" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2 flex justify-center"><ClipboardList className="w-5 h-5" /></div>
          <p className="font-medium">Price Breakdown</p>
          <p className="text-slate-400 text-xs mt-1">Define cost factors vendors must break down in quotes</p>
        </Link>
        <Link href="/my-performance" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center">
          <div className="text-3xl mb-2 flex justify-center"><TrendingUp className="w-5 h-5" /></div>
          <p className="font-medium">Employee Performance</p>
          <p className="text-slate-400 text-xs mt-1">Stage completions, build times per employee</p>
        </Link>
        <Link href="/accounts/settings" className="block p-6 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500 text-center col-span-2">
          <div className="text-3xl mb-2 flex justify-center"><Landmark className="w-5 h-5" /></div>
          <p className="font-medium">Invoice &amp; Company Settings</p>
          <p className="text-slate-400 text-xs mt-1">LUT number, company info, bank details for proforma invoices</p>
        </Link>
      </div>
    </div>
  );
}
