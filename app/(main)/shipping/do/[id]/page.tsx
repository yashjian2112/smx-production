import { redirect, notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { DOPackingPanel } from './DOPackingPanel';

export const dynamic = 'force-dynamic';

export default async function DOPackingPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const allowed = ['ADMIN', 'PRODUCTION_MANAGER', 'PACKING', 'SHIPPING', 'ACCOUNTS'];
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
          include: {
            unit: { select: { serialNumber: true, finalAssemblyBarcode: true } },
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
        packingSlip: {
          include: {
            generatedBy: { select: { name: true } },
            packingList: {
              select: { id: true, listNumber: true, generatedAt: true },
            },
          },
        },
      },
    }),
    prisma.boxSize.findMany({
      where:   { active: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!dispatchOrder) notFound();

  // ── Server-side auto-fix: set dispatchQty for legacy DOs where it is 0 ──────
  if ((dispatchOrder as any).dispatchQty === 0) {
    const readyCount = await prisma.controllerUnit.count({
      where: {
        orderId:          dispatchOrder.orderId,
        currentStage:     'FINAL_ASSEMBLY',
        currentStatus:    { in: ['APPROVED', 'COMPLETED'] },
        readyForDispatch: false,
        packingBoxItem:   null,
        dispatchOrderScan: null,
      },
    });
    const qty = readyCount > 0 ? readyCount : dispatchOrder.order.quantity;
    await prisma.dispatchOrder.update({ where: { id: params.id }, data: { dispatchQty: qty } });
    (dispatchOrder as any).dispatchQty = qty;
  }

  // Serialize dates to ISO strings
  const serialized = {
    ...dispatchOrder,
    createdAt:   dispatchOrder.createdAt.toISOString(),
    updatedAt:   dispatchOrder.updatedAt.toISOString(),
    submittedAt: dispatchOrder.submittedAt?.toISOString() ?? null,
    approvedAt:  dispatchOrder.approvedAt?.toISOString() ?? null,
    scans: dispatchOrder.scans.map((scan) => ({
      ...scan,
      scannedAt: scan.scannedAt.toISOString(),
    })),
    boxes: dispatchOrder.boxes.map((box) => ({
      ...box,
      createdAt: box.createdAt.toISOString(),
      items: box.items.map((item) => ({
        ...item,
        scannedAt: item.scannedAt.toISOString(),
      })),
    })),
    packingSlip: dispatchOrder.packingSlip ? {
      ...dispatchOrder.packingSlip,
      generatedAt: dispatchOrder.packingSlip.generatedAt.toISOString(),
      scannedAt:   dispatchOrder.packingSlip.scannedAt?.toISOString() ?? null,
      packingList: dispatchOrder.packingSlip.packingList ? {
        ...dispatchOrder.packingSlip.packingList,
        generatedAt: dispatchOrder.packingSlip.packingList.generatedAt.toISOString(),
      } : null,
    } : null,
  };

  const canApprove = ['ADMIN', 'ACCOUNTS'].includes(session.role);

  return (
    <DOPackingPanel do={serialized as any} boxSizes={boxSizes} role={session.role} canApprove={canApprove} />
  );
}
