import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getAllSettings } from '@/lib/app-settings';
import { PrintInvoice } from './PrintInvoice';

export default async function PrintInvoicePage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const invoice = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      items: { orderBy: { sortOrder: 'asc' } },
      dispatchOrder: {
        include: {
          order: {
            include: {
              product: { select: { code: true, name: true } },
            },
          },
          approvedBy: { select: { name: true } },
        },
      },
      proforma: {
        select: {
          invoiceNumber: true,
          termsOfPayment: true,
          deliveryDays: true,
          termsOfDelivery: true,
          shippingRoute: true,
        },
      },
      relatedInvoice: {
        select: { id: true, invoiceNumber: true, subType: true },
      },
    },
  });

  if (!invoice) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Invoice not found.</div>;

  const settings = await getAllSettings();

  return <PrintInvoice invoice={invoice as any} settings={settings} />;
}
