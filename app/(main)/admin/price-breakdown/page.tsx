import { redirect } from 'next/navigation';
import { getSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import PriceBreakdownAdmin from './PriceBreakdownAdmin';

export default async function PriceBreakdownPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try { requireRole(session, 'ADMIN'); } catch { redirect('/dashboard'); }

  const factors = await prisma.priceBreakdownFactor.findMany({
    where: { active: true },
    orderBy: [{ category: 'asc' }, { order: 'asc' }],
    include: { createdBy: { select: { name: true } } },
  });

  return <PriceBreakdownAdmin factors={factors} />;
}
