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
          select: { serialNumber: true, finalAssemblyBarcode: true, currentStatus: true },
          orderBy: { serialNumber: 'asc' },
        },
      },
    }),
    prisma.order.findUnique({ where: { id }, select: { createdById: true } }).then(async o =>
      o?.createdById ? prisma.user.findUnique({ where: { id: o.createdById }, select: { name: true } }) : null
    ),
  ]);

  if (!order) return notFound();

  return (
    <PrintWorkOrder
      order={{
        orderNumber: order.orderNumber,
        createdAt: order.createdAt.toISOString(),
        quantity: order.quantity,
        voltage: order.voltage,
        dueDate: order.dueDate?.toISOString() ?? null,
        product: { name: order.product.name, code: order.product.code },
        client: order.client ? { customerName: order.client.customerName, code: order.client.code } : null,
        createdBy: createdByUser?.name ?? '—',
        piNumber: order.proformaInvoice?.invoiceNumber ?? null,
        clientPO: order.proformaInvoice?.clientPONumber ?? null,
        units: order.units.map(u => ({
          serialNumber: u.serialNumber,
          barcode: u.finalAssemblyBarcode ?? '',
          status: u.currentStatus,
        })),
      }}
    />
  );
}
