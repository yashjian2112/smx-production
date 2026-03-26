import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function MyPerformancePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'PRODUCTION_MANAGER') redirect('/dashboard');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const completed = await prisma.stageLog.count({
    where: { userId: session.id, statusTo: 'COMPLETED', createdAt: { gte: thirtyDaysAgo } },
  });
  const assigned = await prisma.stageAssignment.count({
    where: { userId: session.id },
  });

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">My Performance</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-smx-surface border border-slate-600 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Assigned (all time)</p>
          <p className="text-2xl font-bold">{assigned}</p>
        </div>
        <div className="bg-smx-surface border border-slate-600 rounded-xl p-4">
          <p className="text-slate-400 text-sm">Completed (last 30 days)</p>
          <p className="text-2xl font-bold text-green-400">{completed}</p>
        </div>
      </div>
      <p className="text-slate-500 text-sm">Detailed scoring is available to managers.</p>
    </div>
  );
}
