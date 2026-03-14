import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { ProformaList } from '../sales/ProformaList';
import { DispatchApprovals } from './DispatchApprovals';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const canAccess = ['ADMIN', 'ACCOUNTS'].includes(session.role);
  if (!canAccess) redirect('/dashboard');

  const [proformas, submittedDispatches] = await Promise.all([
    prisma.proformaInvoice.findMany({
      include: {
        client:    { select: { id: true, code: true, customerName: true, globalOrIndian: true } },
        createdBy: { select: { id: true, name: true } },
        _count:    { select: { items: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    }),

    prisma.dispatch.findMany({
      where:   { status: 'SUBMITTED' },
      include: {
        items: {
          include: {
            unit:      { select: { serialNumber: true, finalAssemblyBarcode: true } },
            scannedBy: { select: { name: true } },
          },
          orderBy: { scannedAt: 'asc' },
        },
        order: {
          select: {
            orderNumber: true,
            quantity:    true,
            client: {
              select: {
                customerName:    true,
                shippingAddress: true,
                billingAddress:  true,
                gstNumber:       true,
                globalOrIndian:  true,
                state:           true,
              },
            },
            product: { select: { code: true, name: true } },
          },
        },
        dispatchedBy: { select: { name: true } },
      },
      orderBy: { submittedAt: 'asc' },
    }),
  ]);

  const serializedProformas = proformas.map((p) => ({
    ...p,
    invoiceDate: p.invoiceDate.toISOString(),
    approvedAt:  p.approvedAt?.toISOString() ?? null,
    createdAt:   p.createdAt.toISOString(),
    updatedAt:   p.updatedAt.toISOString(),
  }));

  const serializedDispatches = submittedDispatches.map((d) => ({
    ...d,
    createdAt:   d.createdAt.toISOString(),
    updatedAt:   d.updatedAt.toISOString(),
    submittedAt: d.submittedAt?.toISOString() ?? null,
    approvedAt:  d.approvedAt?.toISOString()  ?? null,
    items: d.items.map((item) => ({
      ...item,
      scannedAt: item.scannedAt.toISOString(),
    })),
  }));

  const pendingProformas  = proformas.filter((p) => p.status === 'PENDING_APPROVAL').length;
  const pendingDispatches = submittedDispatches.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Accounts</h2>
          <div className="flex gap-3 mt-0.5">
            {pendingProformas > 0 && (
              <p className="text-xs text-amber-400">
                {pendingProformas} invoice{pendingProformas !== 1 ? 's' : ''} pending
              </p>
            )}
            {pendingDispatches > 0 && (
              <p className="text-xs text-sky-400">
                {pendingDispatches} dispatch{pendingDispatches !== 1 ? 'es' : ''} awaiting approval
              </p>
            )}
          </div>
        </div>
        <Link
          href="/accounts/settings"
          className="text-sm text-zinc-400 hover:text-white transition-colors border border-zinc-700 hover:border-zinc-500 rounded-lg px-3 py-2"
        >
          ⚙️ LUT Settings
        </Link>
      </div>

      {/* Dispatch approvals — shown prominently when pending */}
      {pendingDispatches > 0 && (
        <DispatchApprovals dispatches={serializedDispatches as any} />
      )}

      <ProformaList proformas={serializedProformas as any} role={session.role} />
    </div>
  );
}
