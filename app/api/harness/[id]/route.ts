import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextHarnessBarcode, generateNextHarnessSerial } from '@/lib/barcode';

/**
 * PATCH /api/harness/[id] — update harness unit status
 * Body: { action: 'accept' | 'start_crimping' | 'crimping_done' | 'qc_pass' | 'qc_fail' | 'rework', qcData?, remarks? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession();
    requireRole(session, 'ADMIN', 'PRODUCTION_MANAGER', 'HARNESS_PRODUCTION');
    const { id } = await params;
    const body = await req.json();
    const { action, qcData, remarks } = body as {
      action: 'accept' | 'start_crimping' | 'crimping_done' | 'qc_pass' | 'qc_fail' | 'rework';
      qcData?: Record<string, unknown>;
      remarks?: string;
    };

    const unit = await prisma.harnessUnit.findUnique({
      where: { id },
      include: { product: { select: { code: true } } },
    });
    if (!unit) return NextResponse.json({ error: 'Harness unit not found' }, { status: 404 });

    // State machine validation
    const transitions: Record<string, { from: string[]; to: string; timeline: string }> = {
      accept:         { from: ['PENDING'],     to: 'ACCEPTED',   timeline: 'harness_accepted' },
      start_crimping: { from: ['ACCEPTED'],    to: 'CRIMPING',   timeline: 'harness_accepted' },
      crimping_done:  { from: ['CRIMPING'],    to: 'QC_PENDING', timeline: 'harness_crimping_done' },
      qc_pass:        { from: ['QC_PENDING', 'QC_FAILED'], to: 'QC_PASSED', timeline: 'harness_qc_passed' },
      qc_fail:        { from: ['QC_PENDING', 'QC_FAILED'], to: 'QC_FAILED', timeline: 'harness_qc_failed' },
      rework:         { from: ['QC_FAILED'],  to: 'CRIMPING',   timeline: 'harness_rework' },
    };

    const transition = transitions[action];
    if (!transition) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    if (!transition.from.includes(unit.status)) {
      return NextResponse.json({
        error: `Cannot ${action} from status ${unit.status}. Expected: ${transition.from.join(' or ')}`,
      }, { status: 400 });
    }

    const data: Record<string, unknown> = { status: transition.to };

    // On accept, assign current user
    if (action === 'accept') {
      data.assignedUserId = session.id;
    }

    // On start_crimping, generate barcode + serial number
    if (action === 'start_crimping') {
      const productCode = unit.product.code;
      data.serialNumber = await generateNextHarnessSerial(productCode);
      data.barcode = await generateNextHarnessBarcode(productCode);
    }

    // On QC pass, also set status to READY (ready for dispatch)
    if (action === 'qc_pass') {
      data.status = 'READY';
    }

    // On rework, clear old QC data so next QC starts fresh
    if (action === 'rework') {
      data.qcData = null;
      data.remarks = remarks || `Rework — sent back from QC failure`;
    }

    // Save QC data if provided
    if (qcData) {
      data.qcData = JSON.parse(JSON.stringify(qcData));
    }

    if (remarks && action !== 'rework') {
      data.remarks = remarks;
    }

    const updated = await prisma.harnessUnit.update({
      where: { id },
      data,
      include: {
        order: { select: { id: true, orderNumber: true } },
        product: { select: { id: true, code: true, name: true } },
        assignedUser: { select: { id: true, name: true } },
      },
    });

    const barcodeStr = updated.barcode || unit.barcode || id.slice(0, 8);
    await appendTimeline({
      orderId: unit.orderId,
      userId: session.id,
      action: transition.timeline as Parameters<typeof appendTimeline>[0]['action'],
      remarks: `Harness ${barcodeStr} — ${action}${remarks ? `: ${remarks}` : ''}`,
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[harness PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
