import { prisma } from '@/lib/prisma';
import { getAllSettings } from '@/lib/app-settings';
import { PrintPackingList } from './PrintPackingList';

export default async function PrintPackingListPage({ params }: { params: { doId: string } }) {
  const dispatchOrder = await prisma.dispatchOrder.findUnique({
    where: { id: params.doId },
    include: {
      order: {
        include: {
          client: true,
          product: { select: { code: true, name: true } },
        },
      },
      boxes: {
        orderBy: { boxNumber: 'asc' },
        include: {
          boxSize: true,
          items: {
            include: { unit: { select: { serialNumber: true } } },
          },
        },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!dispatchOrder) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Dispatch order not found.</div>;

  const settings = await getAllSettings();

  return <PrintPackingList dispatchOrder={dispatchOrder as any} settings={settings} />;
}
