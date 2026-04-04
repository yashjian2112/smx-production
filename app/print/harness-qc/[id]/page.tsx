import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import PrintHarnessQC from './PrintHarnessQC';

export default async function PrintHarnessQCPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const unit = await prisma.harnessUnit.findUnique({
    where: { id },
    include: {
      order: { select: { orderNumber: true } },
      product: { select: { code: true, name: true } },
      assignedUser: { select: { name: true } },
    },
  });

  if (!unit || !unit.qcData) notFound();

  const qcData = unit.qcData as Record<string, { status: string; remarks?: string; name?: string }>;

  return (
    <PrintHarnessQC
      barcode={unit.barcode || unit.serialNumber || 'N/A'}
      productCode={unit.product.code}
      orderNumber={unit.order.orderNumber}
      assignedTo={unit.assignedUser?.name || 'Unassigned'}
      status={unit.status}
      qcData={qcData}
      updatedAt={unit.updatedAt.toISOString()}
    />
  );
}
