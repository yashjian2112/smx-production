import { prisma } from '@/lib/prisma';
import { getAllSettings } from '@/lib/app-settings';
import { PrintBoxLabel } from './PrintBoxLabel';

export default async function PrintBoxLabelPage({ params }: { params: { boxId: string } }) {
  const box = await prisma.packingBox.findUnique({
    where: { id: params.boxId },
    include: {
      boxSize: true,
      dispatchOrder: {
        include: {
          order: {
            include: {
              product: { select: { code: true, name: true } },
            },
          },
        },
      },
      items: {
        include: { unit: { select: { serialNumber: true } } },
      },
    },
  });

  if (!box) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Box not found.</div>;

  const settings = await getAllSettings();

  return <PrintBoxLabel box={box as any} settings={settings} />;
}
