import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StageType } from '@prisma/client';

async function getDashboardData(role: string, userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    if (role === 'PRODUCTION_EMPLOYEE') {
      const [myActive, completedToday, availableByStage] = await Promise.all([
        // Units I am currently working on (IN_PROGRESS)
        prisma.controllerUnit.findMany({
          where: {
            currentStatus: 'IN_PROGRESS',
            stageLogs: { some: { userId } },
            order: { status: 'ACTIVE' },
          },
          include: { order: { include: { product: true } }, product: true },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        }),
        // How many I completed today
        prisma.stageLog.count({
          where: { userId, statusTo: 'COMPLETED', createdAt: { gte: today } },
        }),
        // Available units (PENDING, from active orders) — grouped by stage
        prisma.controllerUnit.findMany({
          where: { currentStatus: 'PENDING', order: { status: 'ACTIVE' } },
          include: { order: { include: { product: true } }, product: true },
          orderBy: { createdAt: 'asc' },
          take: 100,
        }),
      ]);

      // Group available units by stage
      const byStage: Record<string, typeof availableByStage> = {};
      for (const u of availableByStage) {
        if (!byStage[u.currentStage]) byStage[u.currentStage] = [];
        byStage[u.currentStage].push(u);
      }

      return {
        role: 'employee',
        myActive,
        completedToday,
        availableByStage: byStage,
        totalAvailable: availableByStage.length,
      };
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
      return { role: 'employee', myActive: [], completedToday: 0, availableByStage: {}, totalAvailable: 0 };
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
    type EmpUnit = { id: string; serialNumber: string; currentStage: string; currentStatus: string; product?: { name: string } | null };
    const ed = data as { myActive?: EmpUnit[]; completedToday?: number; availableByStage?: Record<string, EmpUnit[]>; totalAvailable?: number };
    const myActive = ed.myActive ?? [];
    const completedToday = ed.completedToday ?? 0;
    const availableByStage = ed.availableByStage ?? {};
    const totalAvailable = ed.totalAvailable ?? 0;

    const stageLabels: Record<string, string> = {
      POWERSTAGE_MANUFACTURING: 'Powerstage',
      BRAINBOARD_MANUFACTURING: 'Brainboard',
      CONTROLLER_ASSEMBLY: 'Assembly',
      QC_AND_SOFTWARE: 'QC & Software',
      REWORK: 'Rework',
      FINAL_ASSEMBLY: 'Final Assembly',
    };

    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">My Work</h2>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">In Progress</p>
            <p className="text-2xl font-semibold text-amber-400">{myActive.length}</p>
          </div>
          <div className="card p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Completed Today</p>
            <p className="text-2xl font-semibold text-green-400">{completedToday}</p>
          </div>
        </div>

        {/* Scan to start — quick action */}
        <Link
          href="/serial"
          className="flex items-center gap-3 p-4 rounded-xl tap-target"
          style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.25)' }}
        >
          <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" /><path d="M14 14h.01M18 14h.01M14 18h.01M18 18h.01M21 14v4M14 21h4" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-sky-400">Scan Barcode to Start Work</p>
            <p className="text-xs text-zinc-500 mt-0.5">Scan any unit barcode to open its work page</p>
          </div>
          <svg className="ml-auto text-zinc-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </Link>

        {/* Currently working on */}
        {myActive.length > 0 && (
          <div>
            <h3 className="font-medium text-sm text-zinc-400 mb-3">Currently Working On</h3>
            <ul className="space-y-2">
              {myActive.map((u) => (
                <li key={u.id}>
                  <Link href={`/units/${u.id}`} className="card-interactive flex items-center gap-3 p-3">
                    <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-mono text-sky-400 text-sm">{u.serialNumber}</p>
                      <p className="text-zinc-500 text-xs">{u.product?.name} · {stageLabels[u.currentStage] ?? u.currentStage}</p>
                    </div>
                    <span className="ml-auto text-xs text-amber-400 shrink-0">IN PROGRESS</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Available work to pick up */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm text-zinc-400">Available Work</h3>
            <span className="text-xs text-zinc-600">{totalAvailable} units pending</span>
          </div>
          {totalAvailable === 0 ? (
            <div className="card p-6 text-center">
              <p className="text-zinc-500 text-sm">No pending units right now.</p>
              <p className="text-zinc-600 text-xs mt-1">Check back later or ask your manager.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(availableByStage).map(([stage, units]) => (
                <div key={stage} className="card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium">{stageLabels[stage] ?? stage}</h4>
                    <span className="text-xs text-zinc-500">{units.length} unit{units.length !== 1 ? 's' : ''}</span>
                  </div>
                  <ul className="space-y-1.5">
                    {units.slice(0, 5).map((u) => (
                      <li key={u.id}>
                        <Link href={`/units/${u.id}`} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors">
                          <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
                          <span className="font-mono text-sky-400 text-sm">{u.serialNumber}</span>
                          <span className="text-zinc-600 text-xs ml-auto">{u.product?.name}</span>
                        </Link>
                      </li>
                    ))}
                    {units.length > 5 && (
                      <li className="text-xs text-zinc-600 pl-3.5">+{units.length - 5} more units</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
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
