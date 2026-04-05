import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const session = await requireRole(['ADMIN']);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Reset all units at POWERSTAGE_MANUFACTURING back to PENDING
  const units = await prisma.controllerUnit.findMany({
    where: { currentStage: 'POWERSTAGE_MANUFACTURING', currentStatus: { in: ['IN_PROGRESS', 'COMPLETED', 'APPROVED', 'WAITING_APPROVAL'] } },
    select: { id: true, serialNumber: true },
  });

  if (units.length === 0) {
    return NextResponse.json({ message: 'No units to reset', count: 0 });
  }

  const unitIds = units.map(u => u.id);

  // Delete active work submissions for these units at PS stage
  await prisma.workSubmission.deleteMany({
    where: { unitId: { in: unitIds }, stage: 'POWERSTAGE_MANUFACTURING' },
  });

  // Delete stage assignments for PS
  await prisma.stageAssignment.deleteMany({
    where: { unitId: { in: unitIds }, stage: 'POWERSTAGE_MANUFACTURING' },
  });

  // Delete stage logs for PS that are IN_PROGRESS
  await prisma.stageLog.deleteMany({
    where: { unitId: { in: unitIds }, stage: 'POWERSTAGE_MANUFACTURING', status: { in: ['IN_PROGRESS', 'COMPLETED'] } },
  });

  // Reset units back to PENDING
  await prisma.controllerUnit.updateMany({
    where: { id: { in: unitIds } },
    data: { currentStatus: 'PENDING' },
  });

  return NextResponse.json({
    message: `Reset ${units.length} powerstage units to PENDING`,
    count: units.length,
    units: units.map(u => u.serialNumber),
  });
}
