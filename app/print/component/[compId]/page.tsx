import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PrintComponent } from './PrintComponent';

export default async function PrintComponentPage({ params }: { params: Promise<{ compId: string }> }) {
  const { compId } = await params;

  const component = await prisma.productComponent.findUnique({
    where: { id: compId },
    include: { product: true },
  });

  if (!component || !component.barcode) notFound();

  const baseWhere = {
    productId: component.productId,
    name: component.name,
    stage: component.stage,
  };

  const [history, pending] = await Promise.all([
    prisma.productComponent.findMany({
      where: { ...baseWhere, printed: true },
      orderBy: { printedAt: 'desc' },
      select: { id: true, barcode: true, printedAt: true, createdAt: true },
      take: 100,
    }),
    prisma.productComponent.findMany({
      where: { ...baseWhere, printed: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true, barcode: true, printedAt: true, createdAt: true },
      take: 100,
    }),
  ]);

  return (
    <PrintComponent
      compId={component.id}
      productId={component.product.id}
      name={component.name}
      partNumber={component.partNumber ?? ''}
      barcode={component.barcode}
      stage={component.stage ?? ''}
      productName={component.product.name}
      productCode={component.product.code}
      history={history as { id: string; barcode: string; printedAt: Date | null; createdAt: Date }[]}
      pending={pending as { id: string; barcode: string; printedAt: Date | null; createdAt: Date }[]}
    />
  );
}
