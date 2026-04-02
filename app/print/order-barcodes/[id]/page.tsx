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
        select: { id: true, serialNumber: true, finalAssemblyBarcode: true, product: { select: { name: true, productType: true } } },
        orderBy: { serialNumber: 'asc' },
      },
    },
  });

  if (!order) return notFound();

  // Only print barcodes for trading units
  const tradingUnits = order.units.filter(u => u.product.productType === 'TRADING');
  const units = tradingUnits.length > 0 ? tradingUnits : order.units;

  return (
    <PrintOrderBarcodes
      orderNumber={order.orderNumber}
      productName={order.product.name}
      units={units.map(u => ({
        serialNumber: u.serialNumber,
        barcode: u.finalAssemblyBarcode ?? u.serialNumber,
        productName: u.product.name,
      }))}
    />
  );
}
