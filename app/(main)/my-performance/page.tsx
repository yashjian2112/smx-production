import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function EmployeePerformancePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') redirect('/dashboard');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch all active production employees
  const employees = await prisma.user.findMany({
    where: { role: 'PRODUCTION_EMPLOYEE', active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });

  // For each employee, fetch stage stats
  const employeeStats = await Promise.all(
    employees.map(async (emp) => {
      const [completedLast30, completedAllTime, assigned, avgBuildTime] = await Promise.all([
        prisma.stageLog.count({
          where: { userId: emp.id, statusTo: 'COMPLETED', createdAt: { gte: thirtyDaysAgo } },
        }),
        prisma.stageLog.count({
          where: { userId: emp.id, statusTo: 'COMPLETED' },
        }),
        prisma.stageAssignment.count({
          where: { userId: emp.id },
        }),
        prisma.stageWorkSubmission.aggregate({
          where: { employeeId: emp.id, analysisStatus: 'PASSED', buildTimeSec: { gt: 0 } },
          _avg: { buildTimeSec: true },
        }),
      ]);

      const avgSec = avgBuildTime._avg.buildTimeSec ?? 0;
      const avgMin = avgSec > 0 ? Math.round(avgSec / 60) : null;

      return { ...emp, completedLast30, completedAllTime, assigned, avgMin };
    })
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Employee Performance</h2>
        <p className="text-slate-400 text-sm mt-1">All active production employees — last 30 days</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-700">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Employee</th>
              <th className="text-right px-4 py-3 font-medium">Assigned (all time)</th>
              <th className="text-right px-4 py-3 font-medium">Completed (30 days)</th>
              <th className="text-right px-4 py-3 font-medium">Completed (all time)</th>
              <th className="text-right px-4 py-3 font-medium">Avg Build Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {employeeStats.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-slate-500 py-8">
                  No active production employees found.
                </td>
              </tr>
            )}
            {employeeStats.map((emp) => (
              <tr key={emp.id} className="bg-smx-surface hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-medium text-white">{emp.name}</p>
                  <p className="text-slate-500 text-xs">{emp.email}</p>
                </td>
                <td className="px-4 py-3 text-right text-slate-300">{emp.assigned}</td>
                <td className="px-4 py-3 text-right">
                  <span className="text-green-400 font-semibold">{emp.completedLast30}</span>
                </td>
                <td className="px-4 py-3 text-right text-slate-300">{emp.completedAllTime}</td>
                <td className="px-4 py-3 text-right text-slate-400">
                  {emp.avgMin !== null ? `${emp.avgMin} min` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
