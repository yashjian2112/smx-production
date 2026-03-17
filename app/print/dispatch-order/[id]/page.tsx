import { prisma } from '@/lib/prisma';
import { getAllSettings } from '@/lib/app-settings';
import { PrintDispatchOrder } from './PrintDispatchOrder';

export default async function PrintDispatchOrderPage({ params }: { params: { id: string } }) {
  const dispatchOrder = await prisma.dispatchOrder.findUnique({
    where: { id: params.id },
    include: {
      order: {
        include: {
          client: true,
          product: { select: { code: true, name: true } },
        },
      },
      createdBy:  { select: { name: true } },
      approvedBy: { select: { name: true } },
      boxes: {
        include: {
          boxSize: {
            select: { name: true, lengthCm: true, widthCm: true, heightCm: true },
          },
          items: {
            include: {
              unit: { select: { serialNumber: true, finalAssemblyBarcode: true } },
            },
          },
        },
        orderBy: { boxNumber: 'asc' },
      },
    },
  });

  if (!dispatchOrder) return (
    <div style={{ padding: 40, fontFamily: 'Arial' }}>Dispatch Order not found.</div>
  );

  const settings = await getAllSettings();

  return <PrintDispatchOrder dispatchOrder={dispatchOrder as any} settings={settings} />;
}
