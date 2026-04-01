import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import MaterialLabelClient from './MaterialLabelClient';

export default async function MaterialLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const material = await prisma.rawMaterial.findUnique({
    where: { id },
    include: { category: { select: { name: true } } }
  });
  if (!material) notFound();
  return <MaterialLabelClient material={{
    id: material.id,
    code: material.code,
    name: material.name,
    unit: material.unit,
    barcode: material.barcode ?? material.code,
    category: material.category?.name ?? null,
    packSize: material.packSize ?? 1,
  }} />;
}
