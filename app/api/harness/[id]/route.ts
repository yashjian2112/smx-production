import { NextRequest, NextResponse } from 'next/server';
import { requireSession, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { appendTimeline } from '@/lib/timeline';
import { generateNextHarnessBarcode, generateNextHarnessSerial } from '@/lib/barcode';
import { notifyMany } from '@/lib/notify';

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
      action: 'accept' | 'start_crimping' | 'crimping_done' | 'qc_pass' | 'qc_fail' | 'rework' | 'confirm_print' | 'dispatch';
      qcData?: Record<string, unknown>;
      remarks?: string;
    };

    const unit = await prisma.harnessUnit.findUnique({
      where: { id },
      include: { product: { select: { code: true } } },
    });
    if (!unit) return NextResponse.json({ error: 'Harness unit not found' }, { status: 404 });

    // Special case: confirm_print — no status change, just sets barcodePrinted = true
    if (action === 'confirm_print') {
      if (unit.status !== 'CRIMPING') {
        return NextResponse.json({ error: 'Can only confirm print during CRIMPING' }, { status: 400 });
      }
      const updated = await prisma.harnessUnit.update({
        where: { id },
        data: { barcodePrinted: true },
        include: {
          order: { select: { id: true, orderNumber: true } },
          product: { select: { id: true, code: true, name: true } },
          assignedUser: { select: { id: true, name: true } },
        },
      });
      const barcodeStr = updated.barcode || id.slice(0, 8);
      await appendTimeline({
        orderId: unit.orderId,
        userId: session.id,
        action: 'harness_barcode_confirmed',
        remarks: `Harness ${barcodeStr} — barcode print confirmed`,
      });
      return NextResponse.json(updated);
    }

    // State machine validation
    const transitions: Record<string, { from: string[]; to: string; timeline: string }> = {
      accept:         { from: ['PENDING'],     to: 'ACCEPTED',   timeline: 'harness_accepted' },
      start_crimping: { from: ['ACCEPTED'],    to: 'CRIMPING',   timeline: 'harness_crimping_started' },
      crimping_done:  { from: ['CRIMPING'],    to: 'QC_PENDING', timeline: 'harness_crimping_done' },
      qc_pass:        { from: ['QC_PENDING', 'QC_FAILED'], to: 'READY', timeline: 'harness_qc_passed' },
      qc_fail:        { from: ['QC_PENDING', 'QC_FAILED'], to: 'QC_FAILED', timeline: 'harness_qc_failed' },
      rework:         { from: ['QC_FAILED'],  to: 'CRIMPING',   timeline: 'harness_rework' },
      dispatch:       { from: ['READY', 'QC_PASSED'], to: 'DISPATCHED', timeline: 'harness_dispatched' },
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

    // On start_crimping, validate job card is ready + generate barcode
    if (action === 'start_crimping') {
      const jobCard = await prisma.jobCard.findUnique({
        where: { orderId_stage: { orderId: unit.orderId, stage: 'HARNESS_CRIMPING' } },
      });
      if (jobCard && !['IN_PROGRESS', 'COMPLETED'].includes(jobCard.status)) {
        const msg = jobCard.status === 'CANCELLED'
          ? 'Cannot start crimping — job card has been cancelled'
          : `Cannot start crimping — materials not yet verified (job card: ${jobCard.status})`;
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      if (!unit.serialNumber || !unit.barcode) {
        const productCode = unit.product.code;
        data.serialNumber = await generateNextHarnessSerial(productCode);
        data.barcode = await generateNextHarnessBarcode(productCode);
      }
      data.barcodePrinted = false; // must print barcode before crimping
    }

    // On rework, clear old QC data so next QC starts fresh + append R to serial & barcode
    if (action === 'rework') {
      // Preserve previous QC results for re-test reference
      if (unit.qcData) {
        data.previousQcData = JSON.parse(JSON.stringify(unit.qcData));
      }
      data.qcData = null;
      data.remarks = remarks || `Rework — sent back from QC failure`;
      data.barcodePrinted = false; // must re-print barcode after rework
      data.reworkCount = (unit.reworkCount ?? 0) + 1;
      // Barcode = Serial Number — both get "R" suffix
      if (unit.serialNumber && !unit.serialNumber.endsWith('R')) {
        data.serialNumber = `${unit.serialNumber}R`;
      }
      if (unit.barcode && !unit.barcode.endsWith('R')) {
        data.barcode = `${unit.barcode}R`;
      }
    }

    // Save QC data — only for QC actions, with full validation
    if (action === 'qc_pass' || action === 'qc_fail') {
      if (!qcData || typeof qcData !== 'object' || Object.keys(qcData).length === 0) {
        return NextResponse.json({ error: 'QC data required — must test all connectors' }, { status: 400 });
      }
      // Validate each connector result has a valid status
      for (const [, val] of Object.entries(qcData)) {
        const v = val as Record<string, unknown>;
        if (!v.status || !['PASS', 'FAIL'].includes(v.status as string)) {
          return NextResponse.json({ error: 'Invalid QC data — all connectors must be PASS or FAIL' }, { status: 400 });
        }
      }
      // Validate all product connectors are covered
      const productConnectors = await prisma.harnessConnector.findMany({
        where: { productId: unit.productId, active: true },
        select: { id: true },
      });
      if (productConnectors.length > 0) {
        const testedIds = new Set(Object.keys(qcData));
        const missing = productConnectors.filter(c => !testedIds.has(c.id));
        if (missing.length > 0) {
          return NextResponse.json({
            error: `Incomplete QC — ${missing.length} connector(s) not tested`,
          }, { status: 400 });
        }
      }
      data.qcData = JSON.parse(JSON.stringify(qcData));
    }
    // qcData ignored for non-QC actions — prevents data corruption via API bypass

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

    // Notifications — non-blocking, fire-and-forget
    try {
      if (['crimping_done', 'qc_pass', 'qc_fail'].includes(action)) {
        const pmUsers = await prisma.user.findMany({
          where: { role: 'PRODUCTION_MANAGER', active: true },
          select: { id: true },
        });
        const pmIds = pmUsers.map(u => u.id);
        if (action === 'crimping_done') {
          notifyMany(pmIds, {
            type: 'HARNESS_QC_READY',
            title: 'Harness ready for QC',
            message: `Harness ${barcodeStr} crimping complete — ready for QC test`,
            relatedModel: 'harnessUnit',
            relatedId: id,
          });
        } else if (action === 'qc_pass') {
          notifyMany(pmIds, {
            type: 'HARNESS_QC_PASSED',
            title: 'Harness QC passed',
            message: `Harness ${barcodeStr} passed QC — ready for dispatch`,
            relatedModel: 'harnessUnit',
            relatedId: id,
          });
        } else if (action === 'qc_fail') {
          notifyMany(pmIds, {
            type: 'HARNESS_QC_FAILED',
            title: 'Harness QC failed',
            message: `Harness ${barcodeStr} failed QC${remarks ? `: ${remarks}` : ''}`,
            relatedModel: 'harnessUnit',
            relatedId: id,
          });
        }
      }
    } catch (notifyErr) {
      console.warn('[harness] Notification failed (non-blocking):', notifyErr);
    }

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[harness PATCH]', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
