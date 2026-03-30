import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import ReturnDetail from './ReturnDetail';

export default async function ReturnDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['ADMIN', 'PRODUCTION_EMPLOYEE', 'PRODUCTION_MANAGER', 'SALES', 'ACCOUNTS'].includes(session.role)) {
    redirect('/dashboard');
  }

  const { id } = await params;

  const ret = await prisma.returnRequest.findUnique({
    where: { id },
    include: {
      client:      { select: { code: true, customerName: true } },
      unit:        { select: { id: true, serialNumber: true, currentStage: true, currentStatus: true, product: { select: { name: true, code: true } } } },
      order:       { select: { id: true, orderNumber: true } },
      reportedBy:  { select: { id: true, name: true } },
      evaluatedBy: { select: { id: true, name: true } },
      repairLogs:  {
        include: { employee: { select: { id: true, name: true } } },
        orderBy: { startedAt: 'desc' },
      },
    },
  });

  if (!ret) redirect('/rework');

  const serialized = {
    ...ret,
    createdAt: ret.createdAt.toISOString(),
    updatedAt: ret.updatedAt.toISOString(),
    repairLogs: ret.repairLogs.map(l => ({
      ...l,
      startedAt:   l.startedAt.toISOString(),
      completedAt: l.completedAt?.toISOString() ?? null,
    })),
  };

  return <ReturnDetail data={serialized} role={session.role} userId={session.id} />;
}
