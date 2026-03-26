import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getAllSettings } from '@/lib/app-settings';
import { PrintPurchaseOrder } from './PrintPurchaseOrder';

export default async function PrintPOPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const po = await prisma.purchaseOrder.findUnique({
    where: { id: params.id },
    include: {
      vendor: true,
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
      rfq: { select: { rfqNumber: true, title: true, paymentTerms: true, deadline: true } },
      items: {
        include: { rawMaterial: { select: { name: true, code: true, unit: true } } },
      },
    },
  });

  if (!po) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Purchase Order not found.</div>;

  const settings = await getAllSettings();
  return <PrintPurchaseOrder po={po as any} settings={settings} />;
}
