import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EditProformaForm } from './EditProformaForm';

export default async function EditProformaPage({ params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const canEdit = ['ADMIN', 'SALES'].includes(session.role);
  if (!canEdit) redirect('/sales');

  const proforma = await prisma.proformaInvoice.findUnique({
    where: { id: params.id },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: { product: { select: { id: true, code: true, name: true } } },
      },
    },
  });

  if (!proforma) redirect('/sales');

  // Only DRAFT can be edited by SALES
  if (session.role === 'SALES' && proforma.status !== 'DRAFT') redirect(`/sales/${params.id}`);

  // SALES can only edit their own invoices
  if (session.role === 'SALES' && proforma.createdById !== session.id) redirect(`/sales/${params.id}`);

  const [clients, products] = await Promise.all([
    prisma.client.findMany({ where: { active: true }, orderBy: { customerName: 'asc' } }),
    prisma.product.findMany({ where: { active: true }, orderBy: { code: 'asc' } }),
  ]);

  const serialized = {
    id:              proforma.id,
    invoiceNumber:   proforma.invoiceNumber,
    invoiceType:     proforma.invoiceType,
    clientId:        proforma.clientId,
    currency:        proforma.currency,
    exchangeRate:    proforma.exchangeRate,
    termsOfPayment:  proforma.termsOfPayment,
    deliveryDays:    proforma.deliveryDays,
    termsOfDelivery: proforma.termsOfDelivery,
    notes:           proforma.notes,
    splitInvoice:    proforma.splitInvoice,
    splitServicePercent: proforma.splitServicePercent,
    shippingRoute:   proforma.shippingRoute,
    items:           proforma.items.map((item) => ({
      id:              item.id,
      description:     item.description,
      productId:       item.productId,
      hsnCode:         item.hsnCode,
      quantity:        item.quantity,
      unitPrice:       item.unitPrice,
      discountPercent: item.discountPercent,
      voltageFrom:     item.voltageFrom,
      voltageTo:       item.voltageTo,
      product:         item.product,
    })),
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Edit Invoice</h2>
        <p className="text-sm text-zinc-500 mt-0.5 font-mono">{proforma.invoiceNumber}</p>
      </div>
      <EditProformaForm proforma={serialized as any} clients={clients as any} products={products} />
    </div>
  );
}
