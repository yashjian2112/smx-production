import { prisma } from '@/lib/prisma';
import { PrintGRNLabel } from './PrintGRNLabel';

export default async function PrintGRNLabelPage({ params }: { params: { batchId: string } }) {
  const batch = await prisma.inventoryBatch.findUnique({
    where:   { id: params.batchId },
    include: {
      rawMaterial: { include: { category: true } },
      goodsReceipt: {
        include: {
          purchaseOrder: {
            include: { vendor: true },
          },
        },
      },
    },
  });

  if (!batch) {
    return (
      <div style={{ padding: 40, fontFamily: 'Arial', color: '#333' }}>
        Batch not found.
      </div>
    );
  }

  return <PrintGRNLabel batch={batch as any} />;
}
