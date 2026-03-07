import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { UnitActions } from './UnitActions';

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;

  const unit = await prisma.controllerUnit.findUnique({
    where: { id },
    include: {
      order: { include: { product: true } },
      product: true,
      assignments: { include: { user: { select: { id: true, name: true, email: true } } } },
      stageLogs: { include: { user: true, approvedBy: true }, orderBy: { createdAt: 'desc' }, take: 20 },
      qcRecords: { include: { issueCategory: true }, orderBy: { createdAt: 'desc' } },
      reworkRecords: { include: { rootCauseCategory: true, assignedUser: true }, orderBy: { createdAt: 'desc' } },
      timelineLogs: { include: { user: true }, orderBy: { createdAt: 'desc' }, take: 30 },
    },
  });

  if (!unit) notFound();

  const statusColors: Record<string, string> = {
    PENDING: 'bg-slate-600',
    IN_PROGRESS: 'bg-amber-500/30 text-amber-400',
    COMPLETED: 'bg-slate-600',
    WAITING_APPROVAL: 'bg-sky-500/30 text-sky-400',
    APPROVED: 'bg-green-500/30 text-green-400',
    REJECTED_BACK: 'bg-red-500/30 text-red-400',
    BLOCKED: 'bg-red-500/30 text-red-400',
  };
  const stageLabels: Record<string, string> = {
    POWERSTAGE_MANUFACTURING: 'Powerstage',
    BRAINBOARD_MANUFACTURING: 'Brainboard',
    CONTROLLER_ASSEMBLY: 'Assembly',
    QC_AND_SOFTWARE: 'QC & Software',
    REWORK: 'Rework',
    FINAL_ASSEMBLY: 'Final Assembly',
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="text-slate-400 hover:text-white">← Back</Link>
      </div>
      <div className="bg-smx-surface border border-slate-600 rounded-xl p-4">
        <p className="text-slate-400 text-sm">Serial</p>
        <p className="font-mono text-xl text-sky-400">{unit.serialNumber}</p>
        <p className="text-slate-400 text-sm mt-2">Order {unit.order?.orderNumber} · {unit.product?.name}</p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <span className={`px-2 py-1 rounded text-sm ${statusColors[unit.currentStatus] ?? 'bg-slate-600'}`}>
            {unit.currentStatus.replace('_', ' ')}
          </span>
          <span className="px-2 py-1 rounded text-sm bg-slate-600">
            {stageLabels[unit.currentStage] ?? unit.currentStage}
          </span>
        </div>
      </div>

      <UnitActions unit={JSON.parse(JSON.stringify(unit))} sessionRole={session.role} />

      <div>
        <h3 className="font-medium mb-2">Timeline</h3>
        <ul className="space-y-2">
          {unit.timelineLogs.map((log) => (
            <li key={log.id} className="text-sm border-l-2 border-slate-600 pl-3 py-1">
              <span className="text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
              <span className="text-slate-400 ml-2">{log.action}</span>
              {log.user && <span className="text-slate-500 ml-1">· {log.user.name}</span>}
              {log.remarks && <span className="block text-slate-500">{log.remarks}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
