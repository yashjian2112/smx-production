import { prisma } from '@/lib/prisma';
import { getAllSettings } from '@/lib/app-settings';
import { PrintPackingSlip } from './PrintPackingSlip';

export default async function PrintPackingSlipPage({ params }: { params: { slipId: string } }) {
  const packingSlip = await prisma.packingSlip.findUnique({
    where: { id: params.slipId },
    include: {
      generatedBy: { select: { name: true } },
      packingList: { select: { id: true, listNumber: true } },
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

  if (!packingSlip) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Packing slip not found.</div>;

  const settings = await getAllSettings();

  // Determine if partial or complete
  const allDOsCount = packingSlip.dispatchOrder.order.dispatchOrders.length;
  // A DO is "partial" if there are multiple DOs for the same order
  const isPartial = allDOsCount > 1;

  return <PrintPackingSlip packingSlip={packingSlip as any} settings={settings} isPartial={isPartial} />;
}
