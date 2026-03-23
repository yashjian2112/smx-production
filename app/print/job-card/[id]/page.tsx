import { prisma } from '@/lib/prisma';
import { getAllSettings } from '@/lib/app-settings';
import { PrintJobCard } from './PrintJobCard';

export default async function PrintJobCardPage({ params }: { params: { id: string } }) {
  const jobCard = await prisma.jobCard.findUnique({
    where: { id: params.id },
    include: {
      order: {
        include: {
          product: { select: { code: true, name: true } },
          client:  { select: { customerName: true, code: true } },
        },
      },
      createdBy:    { select: { name: true } },
      dispatchedBy: { select: { name: true } },
      items: {
        include: {
          rawMaterial: {
            select: {
              barcode: true,
              name: true,
              unit: true,
              purchaseUnit: true,
              conversionFactor: true,
              category: { select: { name: true, code: true } },
            },
          },
        },
        orderBy: [{ isCritical: 'desc' }, { id: 'asc' }],
      },
    },
  });

  if (!jobCard) return (
    <div style={{ padding: 40, fontFamily: 'Arial' }}>Job Card not found.</div>
  );

  const settings = await getAllSettings();
  return <PrintJobCard jobCard={jobCard as any} settings={settings} />;
}
