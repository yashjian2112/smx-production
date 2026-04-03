import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import PrintHarness from './PrintHarness';

export default async function PrintHarnessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const unit = await prisma.harnessUnit.findUnique({
    where: { id },
    include: {
      order: { select: { orderNumber: true } },
      product: { select: { code: true, name: true } },
    },
  });

  if (!unit || !unit.barcode || !unit.serialNumber) notFound();

  return (
    <PrintHarness
      barcode={unit.barcode}
      serialNumber={unit.serialNumber}
      productCode={unit.product.code}
      productName={unit.product.name}
      orderNumber={unit.order.orderNumber}
    />
  );
}
