import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import PrintOpeningStockLabels from './PrintOpeningStockLabels';

export default async function OpeningStockLabelsPage({ params }: { params: Promise<{ materialId: string }> }) {
  const { materialId } = await params;

  // Get all serials for this material that have no GRN (opening stock)
  const serials = await prisma.materialSerial.findMany({
    where: { materialId, grnId: null },
    include: { material: { select: { id: true, name: true, code: true, unit: true, packSize: true } } },
    orderBy: { barcode: 'asc' },
  });

  if (!serials.length) {
    return (
      <div style={{ padding: '32px', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
        <p style={{ color: '#666' }}>No opening stock labels found for this material.</p>
      </div>
    );
  }

  const material = serials[0].material;

  return <PrintOpeningStockLabels
    material={{ id: material.id, name: material.name, code: material.code, unit: material.unit ?? 'PCS', packSize: material.packSize ?? 1 }}
    serials={serials.map(s => ({ id: s.id, barcode: s.barcode, quantity: s.quantity, status: s.status }))}
  />;
}
