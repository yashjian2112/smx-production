import { prisma } from '@/lib/prisma';
import { getAllSettings } from '@/lib/app-settings';
import { PrintDispatchOrder } from './PrintDispatchOrder';

export default async function PrintDispatchOrderPage({ params }: { params: { id: string } }) {
  const dispatchOrder = await prisma.dispatchOrder.findUnique({
    where: { id: params.id },
    include: {
      order: {
        include: {
          product: { select: { code: true, name: true } },
          proformaInvoice: { select: { shippingRoute: true } },
          // Fetch ready units on the order so we can show them before packing starts
          units: {
            where: {
              currentStage:     'FINAL_ASSEMBLY',
              currentStatus:    { in: ['APPROVED', 'COMPLETED'] },
              readyForDispatch: false,
            },
            select: { serialNumber: true, finalAssemblyBarcode: true },
            orderBy: { serialNumber: 'asc' },
          },
        },
      },
      createdBy:  { select: { name: true } },
      approvedBy: { select: { name: true } },
      boxes: {
        include: {
          boxSize: { select: { name: true, lengthCm: true, widthCm: true, heightCm: true } },
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
