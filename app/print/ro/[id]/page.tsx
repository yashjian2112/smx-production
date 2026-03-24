import { prisma } from '@/lib/prisma';
import { getAllSettings } from '@/lib/app-settings';
import { PrintRO } from './PrintRO';

export default async function PrintROPage({ params }: { params: { id: string } }) {
  const ro = await prisma.requirementOrder.findUnique({
    where: { id: params.id },
    include: {
      items: {
        include: {
          material: { select: { id: true, name: true, code: true, unit: true, currentStock: true } },
        },
        orderBy: { id: 'asc' },
      },
      approvedBy: { select: { name: true } },
      jobCard: { select: { cardNumber: true } },
    },
  });

  if (!ro) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Requirement Order not found.</div>;

  const settings = await getAllSettings();
  return <PrintRO ro={ro as any} settings={settings} />;
}
