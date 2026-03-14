import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ShippingPanel } from './ShippingPanel';

export const dynamic = 'force-dynamic';

export default async function ShippingPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const allowed = ['ADMIN', 'PRODUCTION_MANAGER', 'ACCOUNTS', 'SHIPPING'];
  if (!allowed.includes(session.role)) redirect('/dashboard');

  // Active DRAFT dispatches (all open work)
  const activeDrafts = await prisma.dispatch.findMany({
    where:   { status: 'DRAFT' },
    include: {
      items: {
        include: {
          unit:      { select: { serialNumber: true, finalAssemblyBarcode: true } },
          scannedBy: { select: { name: true } },
        },
        orderBy: { scannedAt: 'asc' },
      },
      order: {
        select: {
          id:          true,
          orderNumber: true,
          quantity:    true,
          client: { select: { customerName: true, shippingAddress: true } },
          product: { select: { code: true, name: true } },
        },
      },
      dispatchedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Serialize dates
  const drafts = activeDrafts.map((d) => ({
    ...d,
    createdAt:   d.createdAt.toISOString(),
    updatedAt:   d.updatedAt.toISOString(),
    submittedAt: d.submittedAt?.toISOString() ?? null,
    approvedAt:  d.approvedAt?.toISOString() ?? null,
    items: d.items.map((item) => ({
      ...item,
      scannedAt: item.scannedAt.toISOString(),
    })),
  }));

  return (
    <ShippingPanel
      sessionRole={session.role}
      sessionName={session.name}
      initialDrafts={drafts as any}
    />
  );
}
