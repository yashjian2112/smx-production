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
        harnessUnits: {
          select: { id: true, harnessModel: true },
        },
      },
    }),
    prisma.order.findUnique({ where: { id }, select: { createdById: true } }).then(async o =>
      o?.createdById ? prisma.user.findUnique({ where: { id: o.createdById }, select: { name: true } }) : null
    ),
  ]);

  if (!order) return notFound();

  // Group trading units by product
  const tradingUnits = order.units.filter(u => u.product.productType === 'TRADING');
  const tradingGroups: Record<string, { name: string; code: string; serials: string[] }> = {};
  for (const u of tradingUnits) {
    const key = u.product.code;
    if (!tradingGroups[key]) {
      tradingGroups[key] = { name: u.product.name, code: u.product.code, serials: [] };
    }
    tradingGroups[key].serials.push(u.serialNumber);
  }

  // Group harness units by variant
  const harnessVariants: Record<string, number> = {};
  for (const h of order.harnessUnits) {
    const variant = h.harnessModel || 'Harness';
    harnessVariants[variant] = (harnessVariants[variant] || 0) + 1;
  }

  // Count manufactured (non-trading) units
  const mfgUnits = order.units.filter(u => u.product.productType !== 'TRADING');

  return (
    <PrintWorkOrder
      order={{
        orderNumber: order.orderNumber,
        createdAt: order.createdAt.toISOString(),
        quantity: order.quantity,
        voltage: order.voltage,
        priority: order.priority,
        dueDate: order.dueDate?.toISOString() ?? null,
        client: order.client ? { customerName: order.client.customerName, code: order.client.code } : null,
        createdBy: createdByUser?.name ?? '—',
        piNumber: order.proformaInvoice?.invoiceNumber ?? null,
        clientPO: order.proformaInvoice?.clientPONumber ?? null,
        product: { name: order.product.name, code: order.product.code },
        mfgUnitCount: mfgUnits.length,
        tradingProducts: Object.values(tradingGroups),
        harnessVariants: Object.entries(harnessVariants).map(([name, qty]) => ({ name, qty })),
      }}
    />
  );
}
