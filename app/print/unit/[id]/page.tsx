import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PrintUnit } from './PrintUnit';

export default async function PrintUnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const unit = await prisma.controllerUnit.findUnique({
    where: { id },
    include: { order: true, product: true },
  });

  if (!unit) notFound();

  return (
    <PrintUnit
      serialNumber={unit.serialNumber}
      orderNumber={unit.order?.orderNumber ?? ''}
      productName={unit.product?.name ?? ''}
      productCode={unit.product?.code ?? ''}
      powerstageBarcode={unit.powerstageBarcode ?? ''}
      brainboardBarcode={unit.brainboardBarcode ?? ''}
      qcBarcode={unit.qcBarcode ?? ''}
      finalAssemblyBarcode={unit.finalAssemblyBarcode ?? unit.serialNumber}
      createdAt={unit.createdAt.toISOString()}
    />
  );
}
