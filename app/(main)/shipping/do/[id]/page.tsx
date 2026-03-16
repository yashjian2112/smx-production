import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DOPackingPanel } from './DOPackingPanel';

export const dynamic = 'force-dynamic';

export default async function DOPackingPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const allowed = ['ADMIN', 'PRODUCTION_MANAGER', 'PRODUCTION_EMPLOYEE', 'SHIPPING', 'ACCOUNTS'];
  if (!allowed.includes(session.role)) redirect('/dashboard');

  const [dispatchOrder, boxSizes] = await Promise.all([
    prisma.dispatchOrder.findUnique({
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
            boxSize: true,
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
    }),
    prisma.boxSize.findMany({
      where:   { active: true },
      orderBy: { name: 'asc' },
    }),
  ]);

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

  const canApprove = ['ADMIN', 'ACCOUNTS'].includes(session.role);

  return (
    <DOPackingPanel do={serialized as any} boxSizes={boxSizes} role={session.role} canApprove={canApprove} />
  );
}
