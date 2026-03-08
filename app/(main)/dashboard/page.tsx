import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StageType } from '@prisma/client';

async function getDashboardData(role: string, userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    if (role === 'PRODUCTION_EMPLOYEE') {
      const assigned = await prisma.stageAssignment.findMany({
        where: { userId },
        include: {
          unit: {
            include: { order: { include: { product: true } }, product: true },
          },
        },
      });
      const unitIds = assigned.map((a) => a.unitId);
      const completedToday = await prisma.stageLog.count({
        where: { unitId: { in: unitIds }, userId, statusTo: 'COMPLETED', createdAt: { gte: today } },
      });
      const blocked = await prisma.controllerUnit.count({
        where: { id: { in: unitIds }, currentStatus: 'BLOCKED' },
      });
      return { role: 'employee', assignedCount: assigned.length, completedToday, blockedCount: blocked, assignedUnits: assigned };
    }

    const [activeOrders, byStageRaw, todayOutput, qcPass, qcFail, reworkPending, blocked] = await Promise.all([
      prisma.order.count({ where: { status: 'ACTIVE' } }),
      prisma.controllerUnit.groupBy({ by: ['currentStage'], where: { order: { status: 'ACTIVE' } }, _count: true }),
      prisma.stageLog.count({ where: { statusTo: 'COMPLETED', createdAt: { gte: today } } }),
      prisma.qCRecord.count({ where: { result: 'PASS', createdAt: { gte: today } } }),
      prisma.qCRecord.count({ where: { result: 'FAIL', createdAt: { gte: today } } }),
      prisma.reworkRecord.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.controllerUnit.count({ where: { currentStatus: 'BLOCKED', order: { status: 'ACTIVE' } } }),
    ]);
    const stageMap = Object.fromEntries(byStageRaw.map((s) => [s.currentStage, s._count]));
    return {
      role: 'manager',
      activeOrders,
      byStage: {
        [StageType.POWERSTAGE_MANUFACTURING]: stageMap[StageType.POWERSTAGE_MANUFACTURING] ?? 0,
        [StageType.BRAINBOARD_MANUFACTURING]: stageMap[StageType.BRAINBOARD_MANUFACTURING] ?? 0,
        [StageType.CONTROLLER_ASSEMBLY]: stageMap[StageType.CONTROLLER_ASSEMBLY] ?? 0,
        [StageType.QC_AND_SOFTWARE]: stageMap[StageType.QC_AND_SOFTWARE] ?? 0,
        [StageType.REWORK]: stageMap[StageType.REWORK] ?? 0,
        [StageType.FINAL_ASSEMBLY]: stageMap[StageType.FINAL_ASSEMBLY] ?? 0,
      },
      todayOutput,
      qcPass,
      qcFail,
      reworkPending,
      waitingApproval: 0,
      blockedCount: blocked,
    };
  } catch (err) {
    console.error('[dashboard] DB error:', err);
    // Return safe defaults on DB error so the page renders instead of crashing
    if (role === 'PRODUCTION_EMPLOYEE') {
      return { role: 'employee', assignedCount: 0, completedToday: 0, blockedCount: 0, assignedUnits: [] };
    }
    return {
      role: 'manager',
      activeOrders: 0,
      byStage: {
        [StageType.POWERSTAGE_MANUFACTURING]: 0,
        [StageType.BRAINBOARD_MANUFACTURING]: 0,
        [StageType.CONTROLLER_ASSEMBLY]: 0,
        [StageType.QC_AND_SOFTWARE]: 0,
        [StageType.REWORK]: 0,
        [StageType.FINAL_ASSEMBLY]: 0,
      },
      todayOutput: 0,
      qcPass: 0,
      qcFail: 0,
      reworkPending: 0,
      waitingApproval: 0,
      blockedCount: 0,
    };
  }
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;
  const data = await getDashboardData(session.role, session.id);

  if (session.role === 'PRODUCTION_EMPLOYEE') {
    const assigned = (data as { assignedUnits?: { unit: { id: string; serialNumber: string; currentStatus: string }; stageAssignment: string }[] }).assignedUnits ?? [];
    const completedToday = (data as { completedToday?: number }).completedToday ?? 0;
    const blocked = (data as { blockedCount?: number }).blockedCount ?? 0;
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">My Dashboard</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Assigned</p>
            <p className="text-2xl font-semibold">{(data as { assignedCount?: number }).assignedCount ?? 0}</p>
          </div>
          <div className="card p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Completed today</p>
            <p className="text-2xl font-semibold text-green-400">{completedToday}</p>
          </div>
          <div className="card p-4 col-span-2">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Blocked</p>
            <p className="text-2xl font-semibold text-amber-400">{blocked}</p>
          </div>
        </div>
        <div>
          <h3 className="font-medium text-sm text-zinc-400 mb-3">My assigned work</h3>
          {assigned.length === 0 ? (
            <p className="text-zinc-600 text-sm">No units assigned.</p>
          ) : (
            <ul className="space-y-2">
              {assigned.slice(0, 10).map((a) => (
                <li key={a.unit?.id}>
                  <Link
                    href={`/units/${a.unit?.id}`}
                    className="card-interactive block p-3"
                  >
                    <span className="font-mono text-sky-400 text-sm">{a.unit?.serialNumber}</span>
                    <span className="text-zinc-500 ml-2 text-sm">{a.unit?.currentStatus}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link
          href="/my-tasks"
          className="btn-primary block w-full py-3 text-center text-sm font-semibold tap-target"
        >
          View all tasks
        </Link>
      </div>
    );
  }

  const d = data as { activeOrders?: number; todayOutput?: number; qcPass?: number; qcFail?: number; reworkPending?: number; waitingApproval?: number; blockedCount?: number; byStage?: Record<string, number> };
  const stats = [
    { label: 'Active orders', value: d.activeOrders ?? 0 },
    { label: "Today's output", value: d.todayOutput ?? 0 },
    { label: 'QC pass', value: d.qcPass ?? 0 },
    { label: 'QC fail', value: d.qcFail ?? 0 },
    { label: 'Rework', value: d.reworkPending ?? 0 },
    { label: 'Blocked', value: d.blockedCount ?? 0 },
  ];
  const byStage = d.byStage ?? {};

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Dashboard</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">{s.label}</p>
            <p className="text-2xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="card p-4">
        <h3 className="font-medium text-sm mb-3">Units by stage</h3>
        <ul className="space-y-2 text-sm">
          {[
            ['Powerstage', byStage.POWERSTAGE_MANUFACTURING ?? 0],
            ['Brainboard', byStage.BRAINBOARD_MANUFACTURING ?? 0],
            ['Assembly', byStage.CONTROLLER_ASSEMBLY ?? 0],
            ['QC', byStage.QC_AND_SOFTWARE ?? 0],
            ['Rework', byStage.REWORK ?? 0],
            ['Final', byStage.FINAL_ASSEMBLY ?? 0],
          ].map(([label, count]) => (
            <li key={label as string} className="flex justify-between items-center">
              <span className="text-zinc-400">{label}</span>
              <span className="font-mono text-white text-sm">{count}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-3">
        <Link href="/orders" className="btn-primary flex-1 py-3 text-center text-sm font-semibold tap-target">
          Orders
        </Link>
      </div>
    </div>
  );
}
