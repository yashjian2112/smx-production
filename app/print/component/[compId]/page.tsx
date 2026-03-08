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

  // Fetch all printed instances of the same component type (same name + stage + product)
  const history = await prisma.productComponent.findMany({
    where: {
      productId: component.productId,
      name: component.name,
      stage: component.stage,
      printed: true,
    },
    orderBy: { printedAt: 'desc' },
    select: { barcode: true, printedAt: true },
    take: 100,
  });

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
      history={history as { barcode: string; printedAt: Date | null }[]}
    />
  );
}
