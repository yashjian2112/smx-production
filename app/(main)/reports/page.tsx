import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try {
    requireRole(session, 'ADMIN');
  } catch {
    redirect('/dashboard');
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [qcPass, qcFail, reworkOpen, ordersActive] = await Promise.all([
    prisma.qCRecord.count({ where: { result: 'PASS', createdAt: { gte: today } } }),
    prisma.qCRecord.count({ where: { result: 'FAIL', createdAt: { gte: today } } }),
    prisma.reworkRecord.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.order.count({ where: { status: 'ACTIVE' } }),
  ]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Reports</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-smx-surface border border-slate-600 rounded-xl p-4">
          <p className="text-slate-400 text-sm">QC pass (today)</p>
          <p className="text-2xl font-bold text-green-400">{qcPass}</p>
        </div>
        <div className="bg-smx-surface border border-slate-600 rounded-xl p-4">
          <p className="text-slate-400 text-sm">QC fail (today)</p>
          <p className="text-2xl font-bold text-red-400">{qcFail}</p>
        </div>
        <div className="bg-smx-surface border border-slate-600 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Rework open</p>
          <p className="text-2xl font-bold">{reworkOpen}</p>
        </div>
        <div className="bg-smx-surface border border-slate-600 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Active orders</p>
          <p className="text-2xl font-bold">{ordersActive}</p>
        </div>
      </div>
      <p className="text-slate-500 text-sm">More report types (daily production, stage-wise, root cause) can be added.</p>
    </div>
  );
}
