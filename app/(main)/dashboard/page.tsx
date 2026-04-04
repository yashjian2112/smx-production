import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { StageType } from '@prisma/client';

async function getDashboardData(role: string, userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  try {
    // ── PACKING ──────────────────────────────────────────────
    if (role === 'PACKING') {
      const [openDOs, packingDOs, submittedDOs, sealedBoxesToday] = await Promise.all([
        prisma.dispatchOrder.count({ where: { status: 'OPEN' } }),
        prisma.dispatchOrder.count({ where: { status: 'PACKING' } }),
        prisma.dispatchOrder.count({ where: { status: 'SUBMITTED' } }),
        prisma.packingBox.count({ where: { isSealed: true, createdAt: { gte: today } } }),
      ]);
      return { role: 'packing', openDOs, packingDOs, submittedDOs, sealedBoxesToday };
    }

    // ── PRODUCTION EMPLOYEE ──────────────────────────────────
    if (role === 'PRODUCTION_EMPLOYEE') {
      const [myActive, completedToday] = await Promise.all([
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
        prisma.stageLog.count({
          where: { userId, statusTo: 'COMPLETED', createdAt: { gte: today } },
        }),
      ]);
      return { role: 'employee', myActive, completedToday };
    }

    // ── SALES ─────────────────────────────────────────────────
    if (role === 'SALES') {
      const [draftPIs, pendingPIs, approvedPIs, monthlyInvoices] = await Promise.all([
        prisma.proformaInvoice.count({ where: { createdById: userId, status: 'DRAFT' } }),
        prisma.proformaInvoice.count({ where: { createdById: userId, status: 'PENDING_APPROVAL' } }),
        prisma.proformaInvoice.count({ where: { createdById: userId, status: 'APPROVED' } }),
        prisma.invoice.aggregate({
          where: {
            proforma: { createdById: userId },
            createdAt: { gte: monthStart },
          },
          _sum: { totalAmount: true },
          _count: true,
        }),
      ]);
      return {
        role: 'sales',
        draftPIs,
        pendingPIs,
        approvedPIs,
        monthlyInvoiceCount: monthlyInvoices._count,
        monthlyRevenue: monthlyInvoices._sum.totalAmount ?? 0,
      };
    }

    // ── ACCOUNTS ──────────────────────────────────────────────
    if (role === 'ACCOUNTS') {
      const [pendingPIs, submittedDOs, overdueInvoices, outstandingInvoices] = await Promise.all([
        prisma.proformaInvoice.count({ where: { status: 'PENDING_APPROVAL' } }),
        prisma.dispatchOrder.count({ where: { status: 'SUBMITTED' } }),
        prisma.invoice.aggregate({
          where: { status: 'OVERDUE' },
          _sum: { totalAmount: true },
          _count: true,
        }),
        prisma.invoice.aggregate({
          where: { status: { in: ['APPROVED', 'PARTIALLY_PAID'] } },
          _sum: { totalAmount: true },
          _count: true,
        }),
      ]);
      return {
        role: 'accounts',
        pendingPIs,
        submittedDOs,
        overdueCount: overdueInvoices._count,
        overdueAmount: overdueInvoices._sum.totalAmount ?? 0,
        outstandingCount: outstandingInvoices._count,
        outstandingAmount: outstandingInvoices._sum.totalAmount ?? 0,
      };
    }

    // ── PURCHASE MANAGER ──────────────────────────────────────
    if (role === 'PURCHASE_MANAGER') {
      const [pendingROs, openRFQs, activePOs, pendingPayments] = await Promise.all([
        prisma.requirementOrder.count({ where: { status: 'APPROVED' } }),
        prisma.rFQ.count({ where: { status: { in: ['OPEN', 'DRAFT'] } } }),
        prisma.purchaseOrder.count({
          where: { status: { in: ['APPROVED', 'SENT', 'CONFIRMED', 'GOODS_ARRIVED', 'PARTIALLY_RECEIVED'] } },
        }),
        prisma.purchaseOrder.count({ where: { paymentStatus: 'UNPAID', status: 'RECEIVED' } }),
      ]);
      return { role: 'purchase', pendingROs, openRFQs, activePOs, pendingPayments };
    }

    // ── QC_USER ────────────────────────────────────────────────
    if (role === 'QC_USER') {
      const [qcPass, qcFail, pendingQC, myCompletedToday] = await Promise.all([
        prisma.qCRecord.count({ where: { result: 'PASS', createdAt: { gte: today } } }),
        prisma.qCRecord.count({ where: { result: 'FAIL', createdAt: { gte: today } } }),
        prisma.controllerUnit.count({
          where: { currentStage: 'QC_AND_SOFTWARE', currentStatus: { in: ['PENDING', 'IN_PROGRESS'] }, order: { status: 'ACTIVE' } },
        }),
        prisma.stageLog.count({ where: { userId, statusTo: 'COMPLETED', createdAt: { gte: today } } }),
      ]);
      return { role: 'qc', qcPass, qcFail, pendingQC, myCompletedToday };
    }

    // ── STORE MANAGER / INVENTORY MANAGER ─────────────────────
    if (role === 'STORE_MANAGER' || role === 'INVENTORY_MANAGER') {
      const [allMaterials, pendingROs] = await Promise.all([
        prisma.rawMaterial.findMany({ select: { currentStock: true, minimumStock: true } }),
        prisma.requirementOrder.count({ where: { status: 'PENDING' } }),
      ]);
      const lowStockCount = allMaterials.filter((m) => m.currentStock <= m.minimumStock).length;
      return { role: 'store', lowStockCount, totalMaterials: allMaterials.length, pendingROs };
    }

    // ── ADMIN / PRODUCTION_MANAGER (default) ──────────────────
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
    if (role === 'PRODUCTION_EMPLOYEE') return { role: 'employee', myActive: [], completedToday: 0 };
    if (role === 'SALES') return { role: 'sales', draftPIs: 0, pendingPIs: 0, approvedPIs: 0, monthlyInvoiceCount: 0, monthlyRevenue: 0 };
    if (role === 'ACCOUNTS') return { role: 'accounts', pendingPIs: 0, submittedDOs: 0, overdueCount: 0, overdueAmount: 0, outstandingCount: 0, outstandingAmount: 0 };
    if (role === 'PURCHASE_MANAGER') return { role: 'purchase', pendingROs: 0, openRFQs: 0, activePOs: 0, pendingPayments: 0 };
    if (role === 'QC_USER') return { role: 'qc', qcPass: 0, qcFail: 0, pendingQC: 0, myCompletedToday: 0 };
    if (role === 'STORE_MANAGER' || role === 'INVENTORY_MANAGER') return { role: 'store', lowStockCount: 0, totalMaterials: 0, pendingROs: 0 };
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
      todayOutput: 0, qcPass: 0, qcFail: 0, reworkPending: 0, waitingApproval: 0, blockedCount: 0,
    };
  }
}

function fmt(amount: number, currency = 'INR') {
  if (currency === 'USD') return `$${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function StatCard({ label, value, color = 'text-white', sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-zinc-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function QuickLink({ href, label, sub, color = 'sky' }: { href: string; label: string; sub: string; color?: string }) {
  const bg = color === 'sky' ? 'rgba(14,165,233,0.08)' : color === 'violet' ? 'rgba(139,92,246,0.08)' : color === 'emerald' ? 'rgba(16,185,129,0.08)' : 'rgba(245,158,11,0.08)';
  const border = color === 'sky' ? 'rgba(14,165,233,0.25)' : color === 'violet' ? 'rgba(139,92,246,0.25)' : color === 'emerald' ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)';
  const iconBg = color === 'sky' ? 'bg-sky-600' : color === 'violet' ? 'bg-violet-600' : color === 'emerald' ? 'bg-emerald-600' : 'bg-amber-600';
  const textColor = color === 'sky' ? 'text-sky-400' : color === 'violet' ? 'text-violet-400' : color === 'emerald' ? 'text-emerald-400' : 'text-amber-400';
  return (
    <Link href={href} className="flex items-center gap-3 p-4 rounded-xl tap-target" style={{ background: bg, border: `1px solid ${border}` }}>
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
      <div>
        <p className={`text-sm font-semibold ${textColor}`}>{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
      </div>
      <svg className="ml-auto text-zinc-600" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
    </Link>
  );
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;
  const data = await getDashboardData(session.role, session.id);

  // ── HARNESS PRODUCTION ──────────────────────────────────────
  if (session.role === 'HARNESS_PRODUCTION') {
    redirect('/harness');
  }

  // ── PACKING ────────────────────────────────────────────────
  if (session.role === 'PACKING') {
    const pd = data as { openDOs: number; packingDOs: number; submittedDOs: number; sealedBoxesToday: number };
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Packing Dashboard</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Waiting to Pack" value={pd.openDOs} color="text-amber-400" sub="Open dispatch orders" />
          <StatCard label="In Packing" value={pd.packingDOs} color="text-blue-400" sub="Currently packing" />
          <StatCard label="Awaiting Approval" value={pd.submittedDOs} color="text-purple-400" sub="Submitted DOs" />
          <StatCard label="Boxes Sealed Today" value={pd.sealedBoxesToday} color="text-emerald-400" sub="Sealed today" />
        </div>
        <QuickLink href="/shipping" label="Go to Packing Floor" sub="View and pack open dispatch orders" color="sky" />
      </div>
    );
  }

  // ── PRODUCTION EMPLOYEE ────────────────────────────────────
  if (session.role === 'PRODUCTION_EMPLOYEE') {
    type ActiveSub = {
      id: string; startedAt: string;
      unit: { id: string; serialNumber: string; currentStage: string; currentStatus: string; product?: { name: string } | null; order?: { id: string; orderNumber: string } | null };
    };
    const ed = data as { myActive?: ActiveSub[]; completedToday?: number };
    const myActive = ed.myActive ?? [];
    const completedToday = ed.completedToday ?? 0;

    const stageLabels: Record<string, string> = {
      POWERSTAGE_MANUFACTURING: 'Powerstage', BRAINBOARD_MANUFACTURING: 'Brainboard',
      CONTROLLER_ASSEMBLY: 'Assembly', QC_AND_SOFTWARE: 'QC & Software',
      REWORK: 'Rework', FINAL_ASSEMBLY: 'Final Assembly',
    };
    const stageDotColor: Record<string, string> = {
      POWERSTAGE_MANUFACTURING: '#f59e0b', BRAINBOARD_MANUFACTURING: '#818cf8',
      CONTROLLER_ASSEMBLY: '#38bdf8', QC_AND_SOFTWARE: '#34d399',
      REWORK: '#f87171', FINAL_ASSEMBLY: '#a78bfa',
    };
    type OrderGroup = { orderId: string; orderNumber: string; productName: string; subs: ActiveSub[] };
    const groupMap: Record<string, OrderGroup> = {};
    for (const sub of myActive) {
      const key = sub.unit.order?.id ?? '__none__';
      if (!groupMap[key]) groupMap[key] = { orderId: key, orderNumber: sub.unit.order?.orderNumber ?? '—', productName: sub.unit.product?.name ?? '', subs: [] };
      groupMap[key].subs.push(sub);
    }
    const orderGroups = Object.values(groupMap);

    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">My Work</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="In Progress" value={myActive.length} color="text-amber-400" />
          <StatCard label="Completed Today" value={completedToday} color="text-green-400" />
        </div>
        {orderGroups.length > 0 ? (
          <div className="space-y-4">
            <h3 className="font-medium text-sm text-zinc-400">Open Work</h3>
            {orderGroups.map((group) => (
              <div key={group.orderId} className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center justify-between px-4 py-3" style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2" strokeLinecap="round" className="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    <span className="text-white font-semibold text-sm font-mono tracking-wide">{group.orderNumber}</span>
                    {group.productName && <span className="text-zinc-500 text-xs truncate">· {group.productName}</span>}
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
                    {group.subs.length} unit{group.subs.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <ul className="divide-y" style={{ '--tw-divide-opacity': 1, borderColor: 'rgba(255,255,255,0.04)' } as React.CSSProperties}>
                  {group.subs.map((sub) => (
                    <li key={sub.id}>
                      <Link href={`/units/${sub.unit.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]">
                        <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: stageDotColor[sub.unit.currentStage] ?? '#f59e0b' }} />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sky-400 text-sm font-semibold">{sub.unit.serialNumber}</p>
                          <p className="text-zinc-500 text-xs mt-0.5">{stageLabels[sub.unit.currentStage] ?? sub.unit.currentStage}</p>
                        </div>
                        <svg className="text-zinc-600 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center">
            <p className="text-zinc-500 text-sm">No open work right now.</p>
            <p className="text-zinc-600 text-xs mt-1">Scan a unit barcode above to start.</p>
          </div>
        )}
      </div>
    );
  }

  // ── SALES ──────────────────────────────────────────────────
  if (session.role === 'SALES') {
    const sd = data as { draftPIs: number; pendingPIs: number; approvedPIs: number; monthlyInvoiceCount: number; monthlyRevenue: number };
    const monthName = new Date().toLocaleString('en-IN', { month: 'long' });
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Sales Dashboard</h2>
          <p className="text-zinc-500 text-xs mt-0.5">{session.name}</p>
        </div>

        {/* Monthly revenue highlight */}
        <div className="card p-5" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide mb-1">{monthName} Revenue</p>
          <p className="text-3xl font-semibold text-violet-300">{fmt(sd.monthlyRevenue)}</p>
          <p className="text-zinc-500 text-xs mt-1">{sd.monthlyInvoiceCount} invoice{sd.monthlyInvoiceCount !== 1 ? 's' : ''} this month</p>
        </div>

        {/* Proforma status */}
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">My Proformas</p>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Draft" value={sd.draftPIs} color="text-zinc-300" />
            <StatCard label="Pending" value={sd.pendingPIs} color="text-amber-400" />
            <StatCard label="Approved" value={sd.approvedPIs} color="text-emerald-400" />
          </div>
        </div>

        {/* Quick actions */}
        <div className="space-y-3">
          <QuickLink href="/sales/new" label="New Proforma" sub="Create a new proforma invoice" color="violet" />
          <QuickLink href="/sales?tab=status" label="Order Status" sub="Track your converted orders" color="sky" />
          <QuickLink href="/sales/clients" label="My Clients" sub="View and manage clients" color="emerald" />
        </div>
      </div>
    );
  }

  // ── ACCOUNTS ───────────────────────────────────────────────
  if (session.role === 'ACCOUNTS') {
    const ad = data as { pendingPIs: number; submittedDOs: number; overdueCount: number; overdueAmount: number; outstandingCount: number; outstandingAmount: number };
    const totalPending = ad.pendingPIs + ad.submittedDOs;
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Accounts Dashboard</h2>
          <p className="text-zinc-500 text-xs mt-0.5">{session.name}</p>
        </div>

        {/* Pending action highlight */}
        {totalPending > 0 && (
          <div className="card p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
            <div className="flex items-center gap-2 mb-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p className="text-amber-400 text-sm font-semibold">Action Required</p>
            </div>
            <div className="flex gap-4 text-xs">
              {ad.pendingPIs > 0 && <span className="text-zinc-300">{ad.pendingPIs} proforma{ad.pendingPIs !== 1 ? 's' : ''} awaiting approval</span>}
              {ad.submittedDOs > 0 && <span className="text-zinc-300">{ad.submittedDOs} dispatch order{ad.submittedDOs !== 1 ? 's' : ''} to approve</span>}
            </div>
          </div>
        )}

        {/* Outstanding & overdue */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Outstanding</p>
            <p className="text-xl font-semibold text-sky-300">{fmt(ad.outstandingAmount)}</p>
            <p className="text-zinc-600 text-xs mt-1">{ad.outstandingCount} invoice{ad.outstandingCount !== 1 ? 's' : ''}</p>
          </div>
          <div className="card p-4">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide mb-1">Overdue</p>
            <p className={`text-xl font-semibold ${ad.overdueCount > 0 ? 'text-red-400' : 'text-zinc-500'}`}>{fmt(ad.overdueAmount)}</p>
            <p className="text-zinc-600 text-xs mt-1">{ad.overdueCount} invoice{ad.overdueCount !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="space-y-3">
          <QuickLink href="/accounts" label="Approvals" sub="Review pending proformas and dispatch orders" color="amber" />
          <QuickLink href="/sales" label="Invoices" sub="View and manage tax invoices" color="sky" />
          <QuickLink href="/accounts/receivable" label="Accounts Receivable" sub="Payments, outstanding, overdue" color="emerald" />
        </div>
      </div>
    );
  }

  // ── PURCHASE MANAGER ───────────────────────────────────────
  if (session.role === 'PURCHASE_MANAGER') {
    const pd = data as { pendingROs: number; openRFQs: number; activePOs: number; pendingPayments: number };
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Procurement Dashboard</h2>
          <p className="text-zinc-500 text-xs mt-0.5">{session.name}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Requirement Orders" value={pd.pendingROs} color="text-amber-400" sub="Approved, awaiting RFQ" />
          <StatCard label="Open RFQs" value={pd.openRFQs} color="text-blue-400" sub="Awaiting vendor quotes" />
          <StatCard label="Active POs" value={pd.activePOs} color="text-violet-400" sub="Sent / in transit" />
          <StatCard label="Payments Due" value={pd.pendingPayments} color={pd.pendingPayments > 0 ? 'text-red-400' : 'text-zinc-500'} sub="Received, unpaid" />
        </div>

        <div className="space-y-3">
          <QuickLink href="/purchase" label="Procurement" sub="Manage RFQs, POs and vendors" color="violet" />
        </div>
      </div>
    );
  }

  // ── QC USER ────────────────────────────────────────────────
  if (session.role === 'QC_USER') {
    const qd = data as { qcPass: number; qcFail: number; pendingQC: number; myCompletedToday: number };
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">QC Dashboard</h2>
          <p className="text-zinc-500 text-xs mt-0.5">{session.name}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="QC Pass Today" value={qd.qcPass} color="text-emerald-400" sub="Passed inspection" />
          <StatCard label="QC Fail Today" value={qd.qcFail} color="text-red-400" sub="Failed / sent to rework" />
          <StatCard label="Pending QC" value={qd.pendingQC} color="text-amber-400" sub="Awaiting inspection" />
          <StatCard label="My Completed" value={qd.myCompletedToday} color="text-sky-400" sub="Units I completed today" />
        </div>
        <div className="space-y-3">
          <QuickLink href="/production/floor" label="QC Floor" sub="Scan and inspect units" color="emerald" />
        </div>
      </div>
    );
  }

  // ── STORE MANAGER / INVENTORY MANAGER ─────────────────────
  if (session.role === 'STORE_MANAGER' || session.role === 'INVENTORY_MANAGER') {
    const sm = data as { lowStockCount: number; totalMaterials: number; pendingROs: number };
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Inventory Dashboard</h2>
          <p className="text-zinc-500 text-xs mt-0.5">{session.name}</p>
        </div>

        {sm.lowStockCount > 0 && (
          <div className="card p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <p className="text-red-400 text-sm font-semibold">{sm.lowStockCount} item{sm.lowStockCount !== 1 ? 's' : ''} at or below minimum stock</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Low Stock" value={sm.lowStockCount} color={sm.lowStockCount > 0 ? 'text-red-400' : 'text-emerald-400'} sub="At or below minimum" />
          <StatCard label="Total Materials" value={sm.totalMaterials} color="text-zinc-300" sub="In inventory" />
          <StatCard label="Pending ROs" value={sm.pendingROs} color="text-amber-400" sub="Awaiting approval" />
        </div>

        <div className="space-y-3">
          <QuickLink href="/inventory" label="Inventory" sub="View stock, GRNs and movements" color="emerald" />
        </div>
      </div>
    );
  }

  // ── ADMIN / PRODUCTION MANAGER ────────────────────────────
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
