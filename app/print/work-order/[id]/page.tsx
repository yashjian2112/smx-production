import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import PrintWorkOrder from './PrintWorkOrder';

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [order, createdByUser] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: {
        product: true,
        client: true,
        proformaInvoice: { select: { invoiceNumber: true, clientPONumber: true } },
        units: {
          select: {
            serialNumber: true,
            product: { select: { name: true, code: true, productType: true } },
          },
          orderBy: { serialNumber: 'asc' },
        },
      },
    }),
    prisma.order.findUnique({ where: { id }, select: { createdById: true } }).then(async o =>
      o?.createdById ? prisma.user.findUnique({ where: { id: o.createdById }, select: { name: true } }) : null
    ),
  ]);

  if (!order) return notFound();

  // Group only TRADING units by product (manufactured units have their own production flow)
  const tradingUnits = order.units.filter(u => u.product.productType === 'TRADING');
  const productGroups: Record<string, { name: string; code: string; productType: string; serials: string[] }> = {};
  for (const u of tradingUnits) {
    const key = u.product.code;
    if (!productGroups[key]) {
      productGroups[key] = { name: u.product.name, code: u.product.code, productType: 'TRADING', serials: [] };
    }
    productGroups[key].serials.push(u.serialNumber);
  }

  return (
    <PrintWorkOrder
      order={{
        orderNumber: order.orderNumber,
        createdAt: order.createdAt.toISOString(),
        quantity: order.quantity,
        voltage: order.voltage,
        dueDate: order.dueDate?.toISOString() ?? null,
        client: order.client ? { customerName: order.client.customerName, code: order.client.code } : null,
        createdBy: createdByUser?.name ?? '—',
        piNumber: order.proformaInvoice?.invoiceNumber ?? null,
        clientPO: order.proformaInvoice?.clientPONumber ?? null,
        products: Object.values(productGroups),
      }}
    />
  );
}
