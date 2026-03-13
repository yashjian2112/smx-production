import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ProformaDetail } from './ProformaDetail';

export default async function ProformaDetailPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const canAccess = ['ADMIN', 'SALES', 'ACCOUNTS', 'PRODUCTION_MANAGER'].includes(session.role);
  if (!canAccess) redirect('/dashboard');

  const proforma = await prisma.proformaInvoice.findUnique({
    where: { id: params.id },
    include: {
      client:        true,
      createdBy:     { select: { id: true, name: true } },
      approvedBy:    { select: { id: true, name: true } },
      items:         { orderBy: { sortOrder: 'asc' }, include: { product: { select: { id: true, code: true, name: true } } } },
      order:         { select: { id: true, orderNumber: true, status: true } },
      relatedInvoice:{ select: { id: true, invoiceNumber: true } },
    },
  });
  if (!proforma) redirect('/sales');

  const serialized = {
    ...proforma,
    invoiceDate: proforma.invoiceDate.toISOString(),
    approvedAt:  proforma.approvedAt?.toISOString() ?? null,
    createdAt:   proforma.createdAt.toISOString(),
    updatedAt:   proforma.updatedAt.toISOString(),
  };

  return <ProformaDetail proforma={serialized as any} role={session.role} userId={session.id} />;
}
