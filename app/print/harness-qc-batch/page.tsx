import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import PrintBatchQC from './PrintBatchQC';

export default async function PrintBatchQCPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  if (!ids) notFound();

  const idList = ids.split(',').filter(Boolean);
  if (idList.length === 0) notFound();

  const units = await prisma.harnessUnit.findMany({
    where: { id: { in: idList } },
    include: {
      order: { select: { orderNumber: true } },
      product: { select: { code: true, name: true } },
      assignedUser: { select: { name: true } },
    },
    orderBy: { barcode: 'asc' },
  });

  const withQC = units.filter((u) => u.qcData != null);
  if (withQC.length === 0) notFound();

  const reports = withQC.map((unit) => ({
    barcode: unit.barcode || unit.serialNumber || 'N/A',
    productCode: unit.product.code,
    orderNumber: unit.order.orderNumber,
    assignedTo: unit.assignedUser?.name || 'Unassigned',
    status: unit.status,
    qcData: unit.qcData as Record<string, { status: string; remarks?: string; name?: string }>,
    updatedAt: unit.updatedAt.toISOString(),
  }));

  return <PrintBatchQC reports={reports} />;
}
