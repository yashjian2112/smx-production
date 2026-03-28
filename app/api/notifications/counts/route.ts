import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({}, { status: 401 });

    const counts: Record<string, number> = {};
    const role = session.role;

    if (role === 'ACCOUNTS' || role === 'ADMIN') {
      // Pending proformas for approval
      const pendingPI = await prisma.proformaInvoice.count({
        where: { status: 'PENDING_APPROVAL' },
      });
      // Submitted DOs awaiting approval
      const submittedDOs = await prisma.dispatchOrder.count({
        where: { status: 'SUBMITTED' },
      });
      const total = pendingPI + submittedDOs;
      if (total > 0) counts['/accounts'] = total;

      // Pending shipping (submitted DOs for shipping tab)
      if (submittedDOs > 0) counts['/shipping'] = submittedDOs;
    }

    if (role === 'SALES' || role === 'ADMIN') {
      // PIs that were rejected (need attention)
      const rejectedPI = await prisma.proformaInvoice.count({
        where: {
          status: 'REJECTED',
          ...(role === 'SALES' ? { createdById: session.id } : {}),
        },
      });
      if (rejectedPI > 0) counts['/sales'] = rejectedPI;
    }

    if (role === 'PRODUCTION_MANAGER' || role === 'ADMIN') {
      // Units waiting for manager approval
      const pendingApprovals = await prisma.controllerUnit.count({
        where: { currentStatus: 'WAITING_APPROVAL' },
      });
      if (pendingApprovals > 0) counts['/approvals'] = pendingApprovals;
    }

    if (role === 'PURCHASE_MANAGER' || role === 'ADMIN') {
      // IG requests needing GAN
      const igRequested = await prisma.implementationGood.count({
        where: { status: 'REQUESTED' },
      });
      if (igRequested > 0) counts['/sales?tab=impl'] = igRequested;
    }

    if (role === 'STORE_MANAGER' || role === 'INVENTORY_MANAGER' || role === 'ADMIN') {
      // IG needing GRN
      const igGanCreated = await prisma.implementationGood.count({
        where: { status: 'GAN_CREATED' },
      });
      if (igGanCreated > 0) counts['/sales?tab=impl'] = igGanCreated;
    }

    if (role === 'PACKING' || role === 'PRODUCTION_EMPLOYEE' || role === 'ADMIN') {
      // DOs in packing state
      const packingDOs = await prisma.dispatchOrder.count({
        where: { status: 'PACKING' },
      });
      if (packingDOs > 0) counts['/shipping'] = packingDOs;
    }

    return NextResponse.json(counts);
  } catch {
    return NextResponse.json({}, { status: 500 });
  }
}
