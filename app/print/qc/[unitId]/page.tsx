import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PrintQC } from './PrintQC';

export default async function PrintQCPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;

  const unit = await prisma.controllerUnit.findUnique({
    where: { id: unitId },
    include: {
      order: true,
      product: true,
      qcRecords: {
        include: { user: { select: { name: true } }, issueCategory: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!unit) notFound();

  // Latest record's checklist data (JSON stored per test item)
  const latestChecklist = unit.qcRecords[0]?.checklistData ?? null;

  return (
    <PrintQC
      serialNumber={unit.serialNumber}
      orderNumber={unit.order?.orderNumber ?? ''}
      productName={unit.product?.name ?? ''}
      productCode={unit.product?.code ?? ''}
      qcBarcode={unit.qcBarcode ?? ''}
      firmwareVersion={unit.firmwareVersion ?? unit.qcRecords[0]?.firmwareVersion ?? ''}
      softwareVersion={unit.softwareVersion ?? unit.qcRecords[0]?.softwareVersion ?? ''}
      checklistData={latestChecklist as Record<string, { status: string; value: string }> | null}
      qcRecords={unit.qcRecords.map((r) => ({
        id: r.id,
        result: r.result,
        remarks: r.remarks ?? '',
        tester: r.user?.name ?? '—',
        issueCategory: r.issueCategory?.name ?? '',
        createdAt: r.createdAt.toISOString(),
      }))}
    />
  );
}
