import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StageType } from '@prisma/client';

async function getDashboardData(role: string, userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
      where: {
        unitId: { in: unitIds },
        userId,
        statusTo: 'WAITING_APPROVAL',
        createdAt: { gte: today },
      },
    });
    const blocked = await prisma.controllerUnit.count({
      where: { id: { in: unitIds }, currentStatus: 'BLOCKED' },
    });
    return { role: 'employee', assignedCount: assigned.length, completedToday, blockedCount: blocked, assignedUnits: assigned };
  }

  const activeOrders = await prisma.order.count({ where: { status: 'ACTIVE' } });
  const byStage = await prisma.controllerUnit.groupBy({
    by: ['currentStage'],
    where: { order: { status: 'ACTIVE' } },
    _count: true,
  });
  const stageMap = Object.fromEntries(byStage.map((s) => [s.currentStage, s._count]));

  const todayOutput = await prisma.stageLog.count({
    where: { statusTo: 'APPROVED', createdAt: { gte: today } },
  });
  const qcPass = await prisma.qCRecord.count({
    where: { result: 'PASS', createdAt: { gte: today } },
  });
  const qcFail = await prisma.qCRecord.count({
    where: { result: 'FAIL', createdAt: { gte: today } },
  });
  const reworkPending = await prisma.reworkRecord.count({
    where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
  });
  const waitingApproval = await prisma.controllerUnit.count({
    where: { currentStatus: 'WAITING_APPROVAL' },
  });
  const blocked = await prisma.controllerUnit.count({
    where: { currentStatus: 'BLOCKED', order: { status: 'ACTIVE' } },
  });

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
    waitingApproval,
    blockedCount: blocked,
  };
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
          <div className="bg-smx-surface border border-slate-600 rounded-xl p-4">
            <p className="text-slate-400 text-sm">Assigned</p>
            <p className="text-2xl font-bold">{(data as { assignedCount?: number }).assignedCount ?? 0}</p>
          </div>
          <div className="bg-smx-surface border border-slate-600 rounded-xl p-4">
            <p className="text-slate-400 text-sm">Completed today</p>
            <p className="text-2xl font-bold text-green-400">{completedToday}</p>
          </div>
          <div className="bg-smx-surface border border-slate-600 rounded-xl p-4 col-span-2">
            <p className="text-slate-400 text-sm">Blocked</p>
            <p className="text-2xl font-bold text-amber-400">{blocked}</p>
          </div>
        </div>
        <div>
          <h3 className="font-medium mb-2">My assigned work</h3>
          {assigned.length === 0 ? (
            <p className="text-slate-500 text-sm">No units assigned.</p>
          ) : (
            <ul className="space-y-2">
              {assigned.slice(0, 10).map((a) => (
                <li key={a.unit?.id}>
                  <Link
                    href={`/units/${a.unit?.id}`}
                    className="block p-3 rounded-lg bg-smx-surface border border-slate-600 hover:border-sky-500"
                  >
                    <span className="font-mono text-sky-400">{a.unit?.serialNumber}</span>
                    <span className="text-slate-400 ml-2 text-sm">{a.unit?.currentStatus}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link
          href="/my-tasks"
          className="block w-full py-3 text-center rounded-xl bg-sky-600 hover:bg-sky-500 font-medium tap-target"
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
    { label: 'QC pass (today)', value: d.qcPass ?? 0 },
    { label: 'QC fail (today)', value: d.qcFail ?? 0 },
    { label: 'Rework pending', value: d.reworkPending ?? 0 },
    { label: 'Waiting approval', value: d.waitingApproval ?? 0 },
    { label: 'Blocked', value: d.blockedCount ?? 0 },
  ];
  const byStage = d.byStage ?? {};

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Dashboard</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="bg-smx-surface border border-slate-600 rounded-xl p-4">
            <p className="text-slate-400 text-sm">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-smx-surface border border-slate-600 rounded-xl p-4">
        <h3 className="font-medium mb-3">Units by stage</h3>
        <ul className="space-y-2 text-sm">
          <li>Powerstage: <span className="font-mono">{byStage.POWERSTAGE_MANUFACTURING ?? 0}</span></li>
          <li>Brainboard: <span className="font-mono">{byStage.BRAINBOARD_MANUFACTURING ?? 0}</span></li>
          <li>Assembly: <span className="font-mono">{byStage.CONTROLLER_ASSEMBLY ?? 0}</span></li>
          <li>QC: <span className="font-mono">{byStage.QC_AND_SOFTWARE ?? 0}</span></li>
          <li>Rework: <span className="font-mono">{byStage.REWORK ?? 0}</span></li>
          <li>Final: <span className="font-mono">{byStage.FINAL_ASSEMBLY ?? 0}</span></li>
        </ul>
      </div>
      <div className="flex gap-3">
        <Link href="/orders" className="flex-1 py-3 text-center rounded-xl bg-sky-600 hover:bg-sky-500 font-medium tap-target">
          Orders
        </Link>
        <Link href="/approvals" className="flex-1 py-3 text-center rounded-xl border border-slate-600 hover:bg-slate-700 font-medium tap-target">
          Approvals
        </Link>
      </div>
    </div>
  );
}
