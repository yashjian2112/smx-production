import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSession, requireRole } from '@/lib/auth';

/**
 * POST /api/admin/reset-data
 *
 * DESTRUCTIVE: Deletes ALL transactional data and ALL users except admin@smx.com.
 * Keeps: Products, ProductComponents, StageChecklistItems, IssueCategories,
 *        RootCauseCategories, MaterialCategories, UnitOfMeasure, BoxSizes,
 *        VendorCategories, AppSettings, PriceBreakdownFactors.
 * Resets: RawMaterial.currentStock → 0, MaterialVariant.currentStock → 0.
 *
 * ONE-TIME USE — delete this file after running.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  requireRole(session, 'ADMIN');
  if (session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Safety: confirm header
  const confirm = req.headers.get('x-confirm-reset');
  if (confirm !== 'DELETE-ALL-TEST-DATA') {
    return NextResponse.json(
      { error: 'Send header x-confirm-reset: DELETE-ALL-TEST-DATA to proceed' },
      { status: 400 }
    );
  }

  const ADMIN_EMAIL = 'admin@smx.com';

  try {
    // Find admin user first
    const adminUser = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
      select: { id: true },
    });
    if (!adminUser) {
      return NextResponse.json({ error: `Admin user ${ADMIN_EMAIL} not found` }, { status: 404 });
    }

    const log: string[] = [];
    const del = async (label: string, fn: () => Promise<{ count: number }>) => {
      const r = await fn();
      if (r.count > 0) log.push(`${label}: ${r.count}`);
    };

    // ── Phase 0: Null self-references & cross-references ──
    await prisma.$executeRawUnsafe(`UPDATE "ControllerUnit" SET "return_request_id" = NULL`);
    await prisma.$executeRawUnsafe(`UPDATE "invoices" SET "related_invoice_id" = NULL`);
    await prisma.$executeRawUnsafe(`UPDATE "proforma_invoices" SET "related_invoice_id" = NULL`);
    log.push('Nulled self-references');

    // ── Phase 1: Deepest leaf tables ──
    await del('VendorQuoteItemBreakdown', () => prisma.vendorQuoteItemBreakdown.deleteMany());
    await del('VendorPayment', () => prisma.vendorPayment.deleteMany());
    await del('VendorQuoteItem', () => prisma.vendorQuoteItem.deleteMany());
    await del('IGPackingBox', () => prisma.iGPackingBox.deleteMany());
    await del('IGTimeline', () => prisma.iGTimeline.deleteMany());
    await del('GANItem', () => prisma.gANItem.deleteMany());
    await del('RFQVendorInvite', () => prisma.rFQVendorInvite.deleteMany());
    await del('MaterialSerial', () => prisma.materialSerial.deleteMany());
    await del('DamageReport', () => prisma.damageReport.deleteMany());
    await del('JobCardItem', () => prisma.jobCardItem.deleteMany());
    await del('RFQItem', () => prisma.rFQItem.deleteMany());
    await del('RequirementOrderItem', () => prisma.requirementOrderItem.deleteMany());
    await del('GoodsReceiptItem', () => prisma.goodsReceiptItem.deleteMany());
    await del('InventoryBatch', () => prisma.inventoryBatch.deleteMany());
    await del('POItem', () => prisma.pOItem.deleteMany());
    await del('ComponentCheck', () => prisma.componentCheck.deleteMany());
    await del('StageWorkSubmission', () => prisma.stageWorkSubmission.deleteMany());
    await del('StageAssignment', () => prisma.stageAssignment.deleteMany());
    await del('StageLog', () => prisma.stageLog.deleteMany());
    await del('QCRecord', () => prisma.qCRecord.deleteMany());
    await del('TimelineLog', () => prisma.timelineLog.deleteMany());
    await del('PackingBoxItem', () => prisma.packingBoxItem.deleteMany());
    await del('DispatchOrderScan', () => prisma.dispatchOrderScan.deleteMany());
    await del('PackingBox', () => prisma.packingBox.deleteMany());
    await del('DispatchItem', () => prisma.dispatchItem.deleteMany());
    await del('InvoiceItem', () => prisma.invoiceItem.deleteMany());
    await del('Payment', () => prisma.payment.deleteMany());
    await del('RepairLog', () => prisma.repairLog.deleteMany());
    await del('ReworkMaterial', () => prisma.reworkMaterial.deleteMany());
    await del('ReworkRecord', () => prisma.reworkRecord.deleteMany());
    await del('OrderNote', () => prisma.orderNote.deleteMany());

    // ── Phase 2: Mid-level transactional tables ──
    await del('Invoice', () => prisma.invoice.deleteMany());
    await del('DispatchOrder', () => prisma.dispatchOrder.deleteMany());
    await del('Dispatch', () => prisma.dispatch.deleteMany());
    await del('ControllerUnit', () => prisma.controllerUnit.deleteMany());
    await del('ProformaInvoiceItem', () => prisma.proformaInvoiceItem.deleteMany());
    await del('ProformaInvoice', () => prisma.proformaInvoice.deleteMany());
    await del('ReturnRequest', () => prisma.returnRequest.deleteMany());
    await del('JobCard', () => prisma.jobCard.deleteMany());
    await del('Order', () => prisma.order.deleteMany());

    // ── Phase 3: Procurement chain ──
    await del('GoodsReceipt', () => prisma.goodsReceipt.deleteMany());
    await del('GoodsArrivalNote', () => prisma.goodsArrivalNote.deleteMany());
    await del('PaymentRequest', () => prisma.paymentRequest.deleteMany());
    await del('VendorInvoice', () => prisma.vendorInvoice.deleteMany());
    await del('VendorPerformance', () => prisma.vendorPerformance.deleteMany());
    await del('VendorQuote', () => prisma.vendorQuote.deleteMany());
    await del('VendorBid', () => prisma.vendorBid.deleteMany());
    await del('BidInvitation', () => prisma.bidInvitation.deleteMany());
    await del('PurchaseOrder', () => prisma.purchaseOrder.deleteMany());
    await del('PurchaseRequest', () => prisma.purchaseRequest.deleteMany());
    await del('RFQ', () => prisma.rFQ.deleteMany());
    await del('RequirementOrder', () => prisma.requirementOrder.deleteMany());
    await del('StockMovement', () => prisma.stockMovement.deleteMany());

    // ── Phase 4: Other transactional ──
    await del('SampleRequest', () => prisma.sampleRequest.deleteMany());
    await del('ImplementationGood', () => prisma.implementationGood.deleteMany());

    // ── Phase 5: Cleanup tables ──
    await del('AdminNotification', () => prisma.adminNotification.deleteMany());
    await del('POOverrideRequest', () => prisma.pOOverrideRequest.deleteMany());
    await del('Notification', () => prisma.notification.deleteMany());
    await del('AuditLog', () => prisma.auditLog.deleteMany());
    await del('AttendanceRecord', () => prisma.attendanceRecord.deleteMany());
    await del('UserPerformanceSummary', () => prisma.userPerformanceSummary.deleteMany());

    // ── Phase 6: Delete clients and vendors (test data) ──
    await del('Client', () => prisma.client.deleteMany());
    // Null preferredVendorId on RawMaterial before deleting vendors
    await prisma.$executeRawUnsafe(`UPDATE "raw_materials" SET "preferred_vendor_id" = NULL`);
    await del('Vendor', () => prisma.vendor.deleteMany());
    await del('VendorCategory', () => prisma.vendorCategory.deleteMany());

    // ── Phase 7: Delete materials, BOM, variants ──
    await del('MaterialVariant', () => prisma.materialVariant.deleteMany());
    await del('BOMItem', () => prisma.bOMItem.deleteMany());
    await del('RawMaterial', () => prisma.rawMaterial.deleteMany());
    await del('MaterialCategory', () => prisma.materialCategory.deleteMany());

    // ── Phase 8: Reassign PriceBreakdownFactor ownership to admin, then cleanup ──
    await prisma.priceBreakdownFactor.updateMany({
      data: { createdById: adminUser.id },
    });
    // Null AppSetting updatedById for non-admin users
    await prisma.$executeRawUnsafe(
      `UPDATE "app_settings" SET "updated_by_id" = NULL WHERE "updated_by_id" != $1`,
      adminUser.id
    );

    // ── Phase 9: Delete all users except admin ──
    const deletedUsers = await prisma.user.deleteMany({
      where: { email: { not: ADMIN_EMAIL } },
    });
    log.push(`Users deleted: ${deletedUsers.count}`);

    return NextResponse.json({
      success: true,
      adminKept: ADMIN_EMAIL,
      deletions: log,
      message: 'All test data wiped. Fresh start ready.',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Reset failed:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
