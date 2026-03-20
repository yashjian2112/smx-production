import { prisma } from '@/lib/prisma';
import { getAllSettings } from '@/lib/app-settings';
import { PrintPackingListDoc } from './PrintPackingListDoc';

export default async function PrintPackingListDocPage({ params }: { params: { listId: string } }) {
  const packingList = await prisma.packingList.findUnique({
    where: { id: params.listId },
    include: {
      generatedBy: { select: { name: true } },
      packingSlip: {
        include: { generatedBy: { select: { name: true } } },
      },
      dispatchOrder: {
        include: {
          order: {
            include: {
              product: { select: { code: true, name: true } },
              client:  { select: { customerName: true } },
              dispatchOrders: { select: { id: true } },
            },
          },
          createdBy: { select: { name: true } },
          boxes: {
            orderBy: { boxNumber: 'asc' },
            include: {
              boxSize: true,
              items: {
                orderBy: { scannedAt: 'asc' },
                include: { unit: { select: { serialNumber: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!packingList) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Packing list not found.</div>;

  const settings = await getAllSettings();
  const allDOsCount = packingList.dispatchOrder.order.dispatchOrders.length;
  const isPartial   = allDOsCount > 1;

  return <PrintPackingListDoc packingList={packingList as any} settings={settings} isPartial={isPartial} />;
}
