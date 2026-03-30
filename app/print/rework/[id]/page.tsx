import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getAllSettings } from '@/lib/app-settings';
import PrintRTN from './PrintRTN';

export default async function PrintRTNPage({ params }: { params: { id: string } }) {
  const ret = await prisma.returnRequest.findUnique({
    where: { id: params.id },
    include: {
      client:     { select: { customerName: true, code: true } },
      unit:       { select: { serialNumber: true, product: { select: { name: true, code: true } } } },
      reportedBy: { select: { name: true } },
      repairLogs: {
        include: { employee: { select: { name: true } } },
        orderBy:  { startedAt: 'desc' },
        take: 1,
      },
      materials: {
        where:   { status: { in: ['PENDING', 'ISSUED'] } },
        include: { requestedBy: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!ret) notFound();

  const settings = await getAllSettings();

  const data = {
    ...ret,
    createdAt: ret.createdAt.toISOString(),
    updatedAt: ret.updatedAt.toISOString(),
    repairLogs: ret.repairLogs.map(l => ({
      ...l,
      startedAt:   l.startedAt.toISOString(),
      completedAt: l.completedAt?.toISOString() ?? null,
    })),
    materials: ret.materials.map(m => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      issuedAt:  m.issuedAt?.toISOString() ?? null,
    })),
  };

  return <PrintRTN data={data as any} settings={settings} />;
}
