import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PrintComponent } from './PrintComponent';

export default async function PrintComponentPage({ params }: { params: Promise<{ compId: string }> }) {
  const { compId } = await params;
  const session = await getSession();

  const component = await prisma.productComponent.findUnique({
    where: { id: compId },
    include: { product: true },
  });

  if (!component || !component.barcode) notFound();

  if (component.stage === 'FINAL_ASSEMBLY') {
    const units = await prisma.controllerUnit.findMany({
      where: {
        productId: component.productId,
        finalAssemblyBarcode: { not: null },
      },
      include: {
        order: { select: { orderNumber: true } },
      },
      orderBy: [
        { updatedAt: 'desc' },
        { serialNumber: 'asc' },
      ],
      take: 50,
    });

    return (
      <div className="min-h-dvh p-4" style={{ fontFamily: 'var(--font-poppins, sans-serif)' }}>
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <Link href="/orders" className="text-sm text-zinc-500 hover:text-white transition-colors">
              ← Orders
            </Link>
          </div>

          <div className="card p-5 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-amber-400 font-semibold">Final Assembly</p>
              <h1 className="text-xl font-semibold text-white mt-1">Controller Serial Labels</h1>
              <p className="text-sm text-zinc-400 mt-2">
                Final Assembly does not use component barcode stickers. Print the controller serial label from a unit below.
              </p>
            </div>

            <div className="rounded-xl p-3 text-sm" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}>
              <p className="text-amber-300 font-medium">Label format</p>
              <p className="text-zinc-300 mt-1">Warranty Void If Removed + Serial Number + Code 128</p>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Available Controller Labels</h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Product {component.product.code} · {component.product.name}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {session?.role === 'ADMIN' && (
                  <a
                    href={`/print/unit/manual?productCode=${encodeURIComponent(component.product.code)}&productName=${encodeURIComponent(component.product.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded-lg text-xs font-semibold"
                    style={{ background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}
                  >
                    Manual Print
                  </a>
                )}
                <span className="text-xs text-zinc-500">{units.length} unit{units.length !== 1 ? 's' : ''}</span>
              </div>
            </div>

            {units.length === 0 ? (
              <div className="rounded-xl p-4 text-sm text-zinc-500" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                No controller serial labels are ready yet. Final Assembly barcodes appear once units reach Final Assembly.
              </div>
            ) : (
              <div className="space-y-2">
                {units.map((unit) => (
                  <div
                    key={unit.id}
                    className="rounded-xl p-3 flex items-center justify-between gap-3"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm text-sky-400">{unit.serialNumber}</p>
                      <p className="font-mono text-xs text-zinc-300 mt-1">{unit.finalAssemblyBarcode}</p>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Order {unit.order?.orderNumber ?? '—'} · {unit.currentStatus.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <a
                      href={`/print/unit/${unit.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 px-3 py-2 rounded-lg text-sm font-medium"
                      style={{ background: 'rgba(14,165,233,0.12)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}
                    >
                      Print Label
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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
