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
        scans: {
          orderBy: { scannedAt: 'asc' },
          select:  { id: true, serial: true, barcode: true },
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
      boxSize: box.boxSize ? { ...box.boxSize, createdAt: box.boxSize.createdAt.toISOString(), updatedAt: box.boxSize.updatedAt.toISOString() } : null,
      items: box.items.map((item) => ({
        ...item,
        scannedAt: item.scannedAt.toISOString(),
      })),
    })),
  };

  const serializedBoxSizes = boxSizes.map((bs) => ({ ...bs, createdAt: bs.createdAt.toISOString(), updatedAt: bs.updatedAt.toISOString() }));

  const canApprove = ['ADMIN', 'ACCOUNTS'].includes(session.role);

  return (
    <DOPackingPanel do={serialized as any} boxSizes={serializedBoxSizes} role={session.role} canApprove={canApprove} />
  );
}
