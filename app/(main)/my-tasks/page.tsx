import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function MyTasksPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'PRODUCTION_EMPLOYEE') redirect('/dashboard');

  const assigned = await prisma.stageAssignment.findMany({
    where: { userId: session.id },
    include: {
      unit: {
        include: { order: { include: { product: true } }, product: true },
      },
    },
  });

  const stageLabels: Record<string, string> = {
    POWERSTAGE_MANUFACTURING: 'Powerstage',
    BRAINBOARD_MANUFACTURING: 'Brainboard',
    CONTROLLER_ASSEMBLY: 'Assembly',
    QC_AND_SOFTWARE: 'QC',
    REWORK: 'Rework',
    FINAL_ASSEMBLY: 'Final',
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">My Assigned Work</h2>
      {assigned.length === 0 ? (
        <p className="text-slate-500">No units assigned to you.</p>
      ) : (
        <ul className="space-y-2">
          {assigned.map((a) => (
            <li key={a.unitId}>
              <Link
                href={`/units/${a.unit.id}`}
                className="block p-4 rounded-xl bg-smx-surface border border-slate-600 hover:border-sky-500"
              >
                <span className="font-mono text-sky-400">{a.unit.serialNumber}</span>
                <span className="text-slate-400 ml-2 text-sm">{stageLabels[a.stage] ?? a.stage}</span>
                <span className={`ml-2 text-xs px-2 py-0.5 rounded ${a.unit.currentStatus === 'BLOCKED' ? 'bg-red-500/20 text-red-400' : 'bg-slate-600'}`}>
                  {a.unit.currentStatus}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
