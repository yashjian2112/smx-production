import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import PrintOrderBarcodes from './PrintOrderBarcodes';

export default async function OrderBarcodesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      product: { select: { name: true, code: true } },
      units: {
        select: { id: true, serialNumber: true, finalAssemblyBarcode: true },
        orderBy: { serialNumber: 'asc' },
      },
    },
  });

  if (!order) return notFound();

  return (
    <PrintOrderBarcodes
      orderNumber={order.orderNumber}
      productName={order.product.name}
      units={order.units.map(u => ({
        serialNumber: u.serialNumber,
        barcode: u.finalAssemblyBarcode ?? u.serialNumber,
      }))}
    />
  );
}
