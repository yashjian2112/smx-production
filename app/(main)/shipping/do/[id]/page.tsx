import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DOPackingPanel } from './DOPackingPanel';

export const dynamic = 'force-dynamic';

export default async function DOPackingPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const allowed = ['ADMIN', 'PRODUCTION_MANAGER', 'SHIPPING', 'ACCOUNTS', 'PRODUCTION_EMPLOYEE'];
  if (!allowed.includes(session.role)) redirect('/dashboard');

  const dispatchOrder = await prisma.dispatchOrder.findUnique({
    where: { id: params.id },
    include: {
      order: {
        select: {
          orderNumber: true,
          quantity: true,
          client: { select: { customerName: true } },
          product: { select: { code: true, name: true } },
        },
      },
      boxes: {
        orderBy: { boxNumber: 'asc' },
        include: {
          items: {
            orderBy: { scannedAt: 'asc' },
            include: {
              unit: { select: { serialNumber: true, finalAssemblyBarcode: true } },
            },
          },
        },
      },
      createdBy: { select: { name: true } },
      invoices: {
        select: { invoiceNumber: true },
      },
    },
  });

  if (!dispatchOrder) notFound();

  // Serialize dates to ISO strings
  const serialized = {
    ...dispatchOrder,
    createdAt:   dispatchOrder.createdAt.toISOString(),
    updatedAt:   dispatchOrder.updatedAt.toISOString(),
    submittedAt: dispatchOrder.submittedAt?.toISOString() ?? null,
    approvedAt:  dispatchOrder.approvedAt?.toISOString() ?? null,
    boxes: dispatchOrder.boxes.map((box) => ({
      ...box,
      createdAt: box.createdAt.toISOString(),
      items: box.items.map((item) => ({
        ...item,
        scannedAt: item.scannedAt.toISOString(),
      })),
    })),
  };

  return (
    <DOPackingPanel do={serialized as any} role={session.role} />
  );
}
