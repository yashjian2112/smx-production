import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import PrintGRNSerials from './PrintGRNSerials';

export default async function GRNSerialsPage({ params }: { params: { grnId: string } }) {
  const grn = await prisma.goodsReceipt.findUnique({
    where: { id: params.grnId },
    include: {
      materialSerials: {
        include: { material: { select: { id: true, name: true, code: true } } },
        orderBy: { barcode: 'asc' },
      },
      purchaseOrder: {
        select: {
          poNumber: true,
          vendor: { select: { name: true } },
        },
      },
    },
  });

  if (!grn) notFound();
  if (!grn.materialSerials.length) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">No material serials found for this GRN.</p>
        <p className="text-gray-400 text-sm mt-1">Only traceable materials (PS/BB stage) generate individual barcodes.</p>
      </div>
    );
  }

  return <PrintGRNSerials grn={{ ...grn, receivedAt: grn.receivedAt.toISOString() }} />;
}
