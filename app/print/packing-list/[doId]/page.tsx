import { prisma } from '@/lib/prisma';
import { getAllSettings } from '@/lib/app-settings';
import { PrintPackingList } from './PrintPackingList';

export default async function PrintPackingListPage({ params }: { params: { doId: string } }) {
  const dispatchOrder = await prisma.dispatchOrder.findUnique({
    where: { id: params.doId },
    include: {
      order: {
        include: {
          product: { select: { code: true, name: true } },
          proformaInvoice: { select: { shippingRoute: true } },
        },
      },
      boxes: {
        orderBy: { boxNumber: 'asc' },
        include: {
          boxSize: true,
          items: {
            include: { unit: { select: { serialNumber: true, finalAssemblyBarcode: true, product: { select: { name: true, code: true } } } } },
          },
        },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!dispatchOrder) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Dispatch order not found.</div>;

  // Block packing list until at least one box label has been sealed
  const hasSealedBox = dispatchOrder.boxes.some((b) => b.isSealed);
  if (!hasSealedBox) return (
    <div style={{ padding: 40, fontFamily: 'Arial, sans-serif', background: '#fff', minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📦</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#1a3a6b', marginBottom: 8 }}>Packing List Not Available</div>
        <div style={{ fontSize: 14, color: '#555', lineHeight: 1.6 }}>
          The packing list can only be printed after at least one box label has been scanned and sealed.
        </div>
        <div style={{ marginTop: 20, fontSize: 12, color: '#999' }}>
          Complete packing and seal the box(es) first, then return here to print.
        </div>
      </div>
    </div>
  );

  const settings = await getAllSettings();

  return <PrintPackingList dispatchOrder={dispatchOrder as any} settings={settings} />;
}
