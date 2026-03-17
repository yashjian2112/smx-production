import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StageType } from '@prisma/client';

async function getDashboardData(role: string, userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    if (role === 'PACKING') {
      const [openDOs, packingDOs, submittedDOs, sealedBoxesToday] = await Promise.all([
        prisma.dispatchOrder.count({ where: { status: 'OPEN' } }),
        prisma.dispatchOrder.count({ where: { status: 'PACKING' } }),
        prisma.dispatchOrder.count({ where: { status: 'SUBMITTED' } }),
        prisma.packingBox.count({ where: { isSealed: true, createdAt: { gte: today } } }),
      ]);
      return { role: 'packing', openDOs, packingDOs, submittedDOs, sealedBoxesToday };
    }

    if (role === 'PRODUCTION_EMPLOYEE') {
      const [myActive, completedToday] = await Promise.all([
        // Units the employee is actively working on (has an IN_PROGRESS submission)
        prisma.stageWorkSubmission.findMany({
          where: { employeeId: userId, analysisStatus: 'IN_PROGRESS' },
          include: {
            unit: {
              include: { order: { include: { product: true } }, product: true },
            },
          },
          orderBy: { startedAt: 'desc' },
          take: 20,
        }),
        // How many stages completed today
        prisma.stageLog.count({
          where: { userId, statusTo: 'COMPLETED', createdAt: { gte: today } },
        }),
      ]);

      return { role: 'employee', myActive, completedToday };
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
      return { role: 'employee', myActive: [], completedToday: 0 };
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

  if (session.role === 'PACKING') {
    const pd = data as { openDOs: number; packingDOs: number; submittedDOs: number; sealedBoxesToday: number };
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Packing Dashboard</h2>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Waiting to Pack</p>
            <p className="text-2xl font-semibold text-amber-400">{pd.openDOs}</p>
            <p className="text-zinc-600 text-xs mt-1">Open dispatch orders</p>
          </div>
          <div className="card p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">In Packing</p>
            <p className="text-2xl font-semibold text-blue-400">{pd.packingDOs}</p>
            <p className="text-zinc-600 text-xs mt-1">Currently packing</p>
          </div>
          <div className="card p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Awaiting Approval</p>
            <p className="text-2xl font-semibold text-purple-400">{pd.submittedDOs}</p>
            <p className="text-zinc-600 text-xs mt-1">Submitted DOs</p>
          </div>
          <div className="card p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Boxes Sealed Today</p>
            <p className="text-2xl font-semibold text-emerald-400">{pd.sealedBoxesToday}</p>
            <p className="text-zinc-600 text-xs mt-1">Sealed today</p>
          </div>
        </div>

        {/* Quick action */}
        <Link
          href="/shipping"
          className="flex items-center gap-3 p-4 rounded-xl tap-target"
          style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.25)' }}
        >
          <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-sky-400">Go to Packing Floor</p>
            <p className="text-xs text-zinc-500 mt-0.5">View and pack open dispatch orders</p>
          </div>
          <svg className="ml-auto text-zinc-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </Link>
      </div>
    );
  }

  if (session.role === 'PRODUCTION_EMPLOYEE') {
    type ActiveSub = {
      id: string;
      startedAt: string;
      unit: {
        id: string;
        serialNumber: string;
        currentStage: string;
        currentStatus: string;
        product?: { name: string } | null;
        order?: { id: string; orderNumber: string } | null;
      };
    };

    const ed = data as { myActive?: ActiveSub[]; completedToday?: number };
    const myActive       = ed.myActive ?? [];
    const completedToday = ed.completedToday ?? 0;

    const stageLabels: Record<string, string> = {
      POWERSTAGE_MANUFACTURING: 'Powerstage',
      BRAINBOARD_MANUFACTURING: 'Brainboard',
      CONTROLLER_ASSEMBLY:      'Assembly',
      QC_AND_SOFTWARE:          'QC & Software',
      REWORK:                   'Rework',
      FINAL_ASSEMBLY:           'Final Assembly',
    };

    const stageDotColor: Record<string, string> = {
      POWERSTAGE_MANUFACTURING: '#f59e0b',
      BRAINBOARD_MANUFACTURING: '#818cf8',
      CONTROLLER_ASSEMBLY:      '#38bdf8',
      QC_AND_SOFTWARE:          '#34d399',
      REWORK:                   '#f87171',
      FINAL_ASSEMBLY:           '#a78bfa',
    };

    // Group active submissions by order
    type OrderGroup = {
      orderId: string;
      orderNumber: string;
      productName: string;
      subs: ActiveSub[];
    };
    const groupMap: Record<string, OrderGroup> = {};
    for (const sub of myActive) {
      const key     = sub.unit.order?.id ?? '__none__';
      const orderNo = sub.unit.order?.orderNumber ?? '—';
      const prodName = sub.unit.product?.name ?? '';
      if (!groupMap[key]) groupMap[key] = { orderId: key, orderNumber: orderNo, productName: prodName, subs: [] };
      groupMap[key].subs.push(sub);
    }
    const orderGroups = Object.values(groupMap);

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

        {/* Scan to start */}
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

        {/* Open Work — grouped by order */}
        {orderGroups.length > 0 ? (
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-zinc-400">Open Work</h3>
            {orderGroups.map((group) => (
              <div
                key={group.orderId}
                className="rounded-2xl overflow-hidden"
                style={{ border: '1px solid rgba(255,255,255,0.07)' }}
              >
                {/* Order header */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2" strokeLinecap="round" className="shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span className="text-white font-semibold text-sm font-mono tracking-wide">{group.orderNumber}</span>
                    {group.productName && (
                      <span className="text-zinc-500 text-xs truncate">· {group.productName}</span>
                    )}
                  </div>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}
                  >
                    {group.subs.length} unit{group.subs.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Units in this order */}
                <ul className="divide-y" style={{ '--tw-divide-opacity': 1, borderColor: 'rgba(255,255,255,0.04)' } as React.CSSProperties}>
                  {group.subs.map((sub) => (
                    <li key={sub.id}>
                      <Link
                        href={`/units/${sub.unit.id}`}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0 animate-pulse"
                          style={{ background: stageDotColor[sub.unit.currentStage] ?? '#f59e0b' }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sky-400 text-sm font-semibold">{sub.unit.serialNumber}</p>
                          <p className="text-zinc-500 text-xs mt-0.5">
                            {stageLabels[sub.unit.currentStage] ?? sub.unit.currentStage}
                          </p>
                        </div>
                        <svg className="text-zinc-600 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          /* No active work — blank state */
          <div className="card p-8 text-center">
            <p className="text-zinc-500 text-sm">No open work right now.</p>
            <p className="text-zinc-600 text-xs mt-1">Scan a unit barcode above to start.</p>
          </div>
        )}
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
