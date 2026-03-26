import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try {
    requireRole(session, 'ADMIN');
  } catch {
    redirect('/dashboard');
  }

  const units = await prisma.controllerUnit.findMany({
    where: { currentStatus: 'WAITING_APPROVAL' },
    include: {
      order: { include: { product: true } },
      product: true,
      assignments: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const stageLabels: Record<string, string> = {
    POWERSTAGE_MANUFACTURING: 'Powerstage',
    BRAINBOARD_MANUFACTURING: 'Brainboard',
    CONTROLLER_ASSEMBLY: 'Assembly',
    QC_AND_SOFTWARE: 'QC',
    FINAL_ASSEMBLY: 'Final',
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Approval Center</h2>
      <p className="text-slate-400 text-sm">{units.length} unit(s) waiting approval.</p>
      {units.length === 0 ? (
        <p className="text-slate-500">No units waiting approval.</p>
      ) : (
        <ul className="space-y-3">
          {units.map((u) => (
            <li key={u.id}>
              <Link
                href={`/units/${u.id}`}
                className="block p-4 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500"
              >
                <span className="font-mono text-sky-400">{u.serialNumber}</span>
                <span className="text-slate-400 ml-2 text-sm">{stageLabels[u.currentStage] ?? u.currentStage}</span>
                <p className="text-slate-500 text-xs mt-1">Order {u.order?.orderNumber}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
