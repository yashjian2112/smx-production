import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextQCBarcode } from '@/lib/barcode';
import { StageType, UnitStatus } from '@prisma/client';
import { z } from 'zod';

// GET — list repair logs for this return
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireSession();
  const { id } = await params;

  const logs = await prisma.repairLog.findMany({
    where: { returnRequestId: id },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: { startedAt: 'desc' },
  });

  return NextResponse.json(logs);
}

const createSchema = z.object({
  issue:          z.string().min(1),
  beforePhotoUrl: z.string().optional(),
  boardPhotoUrl:  z.string().optional(),
});

// POST — start a repair (employee logs what they found)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const ret = await prisma.returnRequest.findUnique({ where: { id } });
    if (!ret) return NextResponse.json({ error: 'Return not found' }, { status: 404 });

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Issue description required' }, { status: 400 });
    }

    const log = await prisma.repairLog.create({
      data: {
        returnRequestId: id,
        unitId:          ret.unitId ?? null,
        issue:           parsed.data.issue,
        employeeId:      session.id,
        beforePhotoUrl:  parsed.data.beforePhotoUrl ?? null,
        boardPhotoUrl:   parsed.data.boardPhotoUrl ?? null,
      },
      include: { employee: { select: { id: true, name: true } } },
    });

    // Auto-transition to IN_REPAIR
    if (['REPORTED', 'APPROVED', 'UNIT_RECEIVED', 'EVALUATED'].includes(ret.status)) {
      await prisma.returnRequest.update({
        where: { id },
        data: { status: 'IN_REPAIR' },
      });
    }

    return NextResponse.json(log, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[repair POST]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

const patchSchema = z.object({
  repairLogId:   z.string().min(1),
  workDone:      z.string().min(1),
  afterPhotoUrl: z.string().optional(),
});

// PATCH — complete a repair (employee logs what they fixed)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    const { id } = await params;

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'repairLogId and workDone required' }, { status: 400 });
    }

    const log = await prisma.repairLog.findFirst({
      where: { id: parsed.data.repairLogId, returnRequestId: id },
    });
    if (!log) return NextResponse.json({ error: 'Repair log not found' }, { status: 404 });

    const updated = await prisma.repairLog.update({
      where: { id: log.id },
      data: {
        workDone:      parsed.data.workDone,
        afterPhotoUrl: parsed.data.afterPhotoUrl ?? null,
        completedAt:   new Date(),
      },
      include: { employee: { select: { id: true, name: true } } },
    });

    // Auto-transition to REPAIRED if return is IN_REPAIR
    const ret = await prisma.returnRequest.findUnique({
      where: { id },
      select: { id: true, status: true, unitId: true },
    });
    if (ret && ret.status === 'IN_REPAIR') {
      await prisma.returnRequest.update({
        where: { id },
        data: { status: 'REPAIRED' },
      });

      // Move linked unit to QC_AND_SOFTWARE stage for real QC testing
      if (ret.unitId) {
        const unit = await prisma.controllerUnit.findUnique({
          where: { id: ret.unitId },
          select: { id: true, qcBarcode: true, product: { select: { code: true } } },
        });
        if (unit) {
          // Generate QC barcode if not already assigned
          let qcBarcode = unit.qcBarcode;
          if (!qcBarcode && unit.product?.code) {
            qcBarcode = await generateNextQCBarcode(unit.product.code);
          }

          await prisma.controllerUnit.update({
            where: { id: ret.unitId },
            data: {
              currentStage:  StageType.QC_AND_SOFTWARE,
              currentStatus: UnitStatus.PENDING,
              ...(qcBarcode ? { qcBarcode } : {}),
            },
          });

          await appendTimeline({
            unitId:  ret.unitId,
            action:  'status_changed',
            stage:   StageType.QC_AND_SOFTWARE,
            remarks: 'Repair completed — sent to QC for testing',
            userId:  session.id,
          });
        }
      }
    }

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[repair PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
