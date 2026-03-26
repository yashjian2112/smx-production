import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getAllSettings } from '@/lib/app-settings';
import { PrintProforma } from './PrintProforma';

export default async function PrintProformaPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const proforma = await prisma.proformaInvoice.findUnique({
    where: { id: params.id },
    include: {
      client:    true,
      createdBy: { select: { id: true, name: true } },
      approvedBy:{ select: { id: true, name: true } },
      items:     { orderBy: { sortOrder: 'asc' }, include: { product: { select: { id: true, code: true, name: true } } } },
    },
  });
  if (!proforma) return <div>Invoice not found</div>;

  if (session.role === 'SALES' && proforma.createdBy.id !== session.id) {
    return <div style={{ padding: 40, fontFamily: 'Arial' }}>Access denied.</div>;
  }

  const settings = await getAllSettings();

  return <PrintProforma proforma={proforma as any} settings={settings} />;
}
